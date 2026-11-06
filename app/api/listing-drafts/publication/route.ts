import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/workspace-auth";
import { getMlSession, getListingPriceQuote, getShippingQuote } from "@/lib/mercado-livre";
import { getWorkspaceSettings } from "@/lib/workspace-settings";
import { analyzeProfitability } from "@/lib/profitability";

export const dynamic = "force-dynamic";
const IMAGE_ROOT = process.env.RADAR_UPLOAD_DIR || "/app/uploads";
const schema = z.object({
  id: z.string().cuid(),
  action: z.enum(["validate", "publish"]),
  confirmed: z.boolean().optional(),
});
const itemData = z.object({
  name: z.string().min(3), title: z.string().min(5), description: z.string().min(60),
  categoryId: z.string().regex(/^MLB\d{3,12}$/),
  brand: z.string().optional(), barcode: z.string().nullable().optional(),
  sku: z.string().optional(), attributes: z.record(z.string(), z.string()).default({}),
  imageUrls: z.array(z.string()).min(1).max(12),
  stock: z.number().int().positive(), costPerUnit: z.number().positive(),
  kitQuantity: z.number().int().min(1), discountPercent: z.number().min(0).max(95),
  operatingCost: z.number().nonnegative(), suggestedPrice: z.number().positive(),
  profit: z.number().positive(), listingType: z.enum(["CLASSIC", "PREMIUM"]),
  logisticType: z.enum(["drop_off", "cross_docking", "xd_drop_off", "fulfillment", "self_service"]),
  freeShipping: z.boolean(), weightGrams: z.number().int().positive(),
  heightCm: z.number().positive(), widthCm: z.number().positive(), lengthCm: z.number().positive(),
});
type Listing = z.infer<typeof itemData>;
type Picture = { id: string } | { source: string };
type Validation = { hash: string; pictures: Picture[]; checkedAt: string };

function contentHash(data: Listing, sellerId: string) {
  return createHash("sha256").update(JSON.stringify(data) + "|" + sellerId).digest("hex");
}
function responseError(message: string, status = 422, causes?: unknown) {
  return NextResponse.json({ error: message, causes }, { status, headers: { "cache-control": "no-store" } });
}
async function mlJson(url: string, token: string, method = "GET", body?: unknown) {
  const response = await fetch(url, {
    method, headers: {
      Authorization: "Bearer " + token,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store", signal: AbortSignal.timeout(22000),
  });
  const payload: unknown = await response.json().catch(() => null);
  return { response, payload };
}
function safeCauses(payload: unknown) {
  const p = payload as { cause?: Array<{ code?: string; message?: string }>; message?: string } | null;
  return (p?.cause ?? []).slice(0, 12).map(x => ({
    code: String(x.code ?? "").slice(0, 90),
    message: String(x.message ?? "").slice(0, 300),
  }));
}
async function pictureRefs(urls: string[], workspaceId: string, token: string): Promise<Picture[]> {
  const refs: Picture[] = [];
  for (const url of urls) {
    if (url.startsWith("https://")) {
      refs.push({ source: url });
      continue;
    }
    const id = /^\/api\/listing-drafts\/photos\/([a-f0-9-]+\.(?:jpg|png|webp))$/.exec(url)?.[1];
    if (!id || !/^[a-f0-9]{8}-[a-f0-9-]{27,}\.(?:jpg|png|webp)$/.test(id)) {
      throw new Error("A foto local não possui um identificador válido.");
    }
    const bytes = await readFile(path.join(IMAGE_ROOT, workspaceId, id));
    const type = id.endsWith(".png") ? "image/png" : id.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type }), id);
    const response = await fetch("https://api.mercadolibre.com/pictures/items/upload", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: form,
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
    const result = await response.json().catch(() => null) as { id?: string } | null;
    if (!response.ok || !result?.id) {
      throw new Error("O Mercado Livre não aceitou uma das fotos. Confira formato e resolução.");
    }
    refs.push({ id: result.id });
  }
  return refs;
}
async function prepare(
  data: Listing, token: string, sellerId: string, workspaceId: string,
  existingPictures?: Picture[],
) {
  const cat = await mlJson("https://api.mercadolibre.com/categories/" + data.categoryId, token);
  const category = cat.payload as {
    listing_allowed?: boolean; status?: string; max_title_length?: number; max_pictures_per_item?: number;
  } | null;
  if (!cat.response.ok || !category?.listing_allowed || category.status !== "enabled") {
    throw new Error("A categoria não está habilitada para novas publicações.");
  }
  if (data.title.length > (category.max_title_length || 120)) {
    throw new Error("O título excede o limite de " + category.max_title_length + " caracteres da categoria.");
  }
  if (data.imageUrls.length > (category.max_pictures_per_item || 12)) {
    throw new Error("A categoria permite menos fotos. Remova as excedentes.");
  }
  const attrs = await mlJson("https://api.mercadolibre.com/categories/" + data.categoryId + "/attributes", token);
  if (!attrs.response.ok || !Array.isArray(attrs.payload)) throw new Error("Não foi possível verificar os atributos exigidos.");
  const required = (attrs.payload as Array<{ id?: string; name?: string; tags?: { required?: boolean; new_required?: boolean } }>)
    .filter(a => a.tags?.required || a.tags?.new_required);
  const attributes = { ...(data.attributes || {}) };
  if (data.brand && !attributes.BRAND) attributes.BRAND = data.brand;
  if (data.barcode && !attributes.GTIN && !attributes.EAN) attributes.GTIN = data.barcode;
  const missing = required.filter(a => a.id && !attributes[a.id]?.trim());
  if (missing.length) throw new Error("Ficha técnica incompleta: " + missing.slice(0, 8).map(a => a.name || a.id).join(", "));
  const settings = await getWorkspaceSettings(workspaceId);
  if (settings.taxPercent == null) throw new Error("Configure o imposto em Metas e configurações.");
  const [fee, shipping] = await Promise.all([
    getListingPriceQuote({
      accessToken: token, price: data.suggestedPrice, categoryId: data.categoryId,
      listingType: data.listingType, logisticType: data.logisticType, shippingMode: "me2",
    }),
    getShippingQuote({
      accessToken: token, userId: sellerId, price: data.suggestedPrice,
      listingType: data.listingType, weightGrams: data.weightGrams,
      heightCm: data.heightCm, widthCm: data.widthCm, lengthCm: data.lengthCm,
      logisticType: data.logisticType, shippingMode: "me2", freeShipping: data.freeShipping,
    }),
  ]);
  const real = analyzeProfitability({
    productName: data.name, supplierPrice: data.costPerUnit,
    discountPercent: data.discountPercent, kitQuantity: data.kitQuantity,
    salePrice: data.suggestedPrice, listingType: data.listingType,
    commissionPercent: fee.commissionPercent, fixedFee: fee.fixedFee,
    quotedSaleFeeAmount: fee.saleFeeAmount, shippingCost: shipping.shippingCost,
    taxPercent: Number(settings.taxPercent), operatingCost: data.operatingCost,
    targetMarginPercent: Number(settings.targetMarginPercent),
    targetRoiPercent: Number(settings.targetRoiPercent),
  });
  if (real.profit <= 0) throw new Error("O preço cotado não cobre os custos atualizados. Recalcule.");
  if (Math.abs(real.profit - data.profit) > 0.5) {
    throw new Error("Tarifa ou frete mudou desde a simulação. Recalcule e salve o rascunho.");
  }

  const pictures = existingPictures ?? await pictureRefs(data.imageUrls, workspaceId, token);
  const body = {
    family_name: data.title,
    category_id: data.categoryId,
    price: data.suggestedPrice,
    currency_id: "BRL",
    available_quantity: data.stock,
    buying_mode: "buy_it_now",
    listing_type_id: data.listingType === "PREMIUM" ? "gold_pro" : "gold_special",
    condition: "new",
    pictures,
    attributes: Object.entries(attributes)
      .filter(([, value]) => value.trim())
      .map(([id, value_name]) => ({ id, value_name })),
    shipping: { mode: "me2", free_shipping: data.freeShipping },
    status: "paused",
  };
  return { body, real };
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return responseError("Origem da requisição não permitida.", 403);
  }
  let user;
  try { user = await requireUser(); }
  catch { return responseError("Sessão expirada.", 401); }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return responseError("Informe uma ação e um rascunho válido.", 400);
  if (parsed.data.action === "publish" && process.env.RADAR_ENABLE_PUBLISHING !== "true") {
    return responseError("Publicação real desativada no Coolify. Habilite RADAR_ENABLE_PUBLISHING=true somente depois da homologação.", 403);
  }
  if (parsed.data.action === "publish" && parsed.data.confirmed !== true) {
    return responseError("Confirme explicitamente que deseja criar um anúncio pausado.", 400);
  }
  const row = await prisma.listingDraft.findFirst({
    where: { id: parsed.data.id, workspaceId: user.workspaceId },
  });
  if (!row) return responseError("Rascunho não encontrado.", 404);
  if (row.mlItemId || row.status === "PUBLISHING" || row.status === "PUBLISHED") {
    return responseError("O anúncio já foi enviado ou está em processamento. Confira antes de tentar novamente.", 409);
  }
  const data = itemData.safeParse(row.content);
  if (!data.success) return responseError("O rascunho está incompleto. Salve os campos, foto, preço e ficha técnica.", 422);
  const session = await getMlSession();
  if (session.account.workspaceId !== user.workspaceId) return responseError("Conta Mercado Livre incompatível.", 403);
  const sellerId = session.account.mercadoLivreUserId;
  const hash = contentHash(data.data, sellerId);
  try {
    if (parsed.data.action === "validate") {
      if (row.status !== "REVIEW" && row.status !== "VALIDATED") {
        return responseError("Salve o anúncio e corrija as pendências antes de validar.", 422);
      }
      if (data.data.sku) {
        const duplicate = await prisma.mercadoLivreProduct.findFirst({
          where: { sellerUserId: sellerId, sku: data.data.sku, status: { in: ["active", "paused"] } },
        });
        if (duplicate) return responseError("Já existe um anúncio com este SKU na conta vinculada.", 409);
      }
      const built = await prepare(data.data, session.accessToken, sellerId, user.workspaceId);
      const validation = await mlJson("https://api.mercadolibre.com/items/validate", session.accessToken, "POST", built.body);
      if (!validation.response.ok) {
        return responseError("O Mercado Livre pediu ajustes antes de publicar.", 422, safeCauses(validation.payload));
      }
      const result: Validation = { hash, pictures: built.body.pictures, checkedAt: new Date().toISOString() };
      const updated = await prisma.listingDraft.updateMany({
        where: { id: row.id, workspaceId: user.workspaceId, status: { in: ["REVIEW", "VALIDATED"] } },
        data: { validation: result, validatedAt: new Date(), status: "VALIDATED" },
      });
      if (!updated.count) return responseError("O rascunho mudou durante a validação. Revise novamente.", 409);
      return NextResponse.json({
        valid: true,
        message: "O Mercado Livre aceitou a pré-validação. Você pode criar o anúncio pausado quando habilitar a publicação.",
        reviewedPrice: data.data.suggestedPrice,
        reviewedProfit: built.real.profit,
      });
    }

    if (row.status !== "VALIDATED") return responseError("Valide este rascunho no Mercado Livre antes de publicar.", 409);
    const last = row.validation as Validation | null;
    if (!last || last.hash !== hash || !last.checkedAt ||
        Date.now() - Date.parse(last.checkedAt) > 20 * 60 * 1000 ||
        !Array.isArray(last.pictures)) {
      return responseError("Validação desatualizada. Faça a pré-validação novamente.", 409);
    }
    const updated = await prisma.listingDraft.updateMany({
      where: { id: row.id, workspaceId: user.workspaceId, status: "VALIDATED" },
      data: { status: "PUBLISHING" },
    });
    if (!updated.count) return responseError("Outro processo está publicando este anúncio.", 409);
    // No automatic retry after reaching the external API: a timeout may have created an item.
    let response;
    try {
      const prepared = await prepare(data.data, session.accessToken, sellerId, user.workspaceId, last.pictures);
      response = await mlJson("https://api.mercadolibre.com/items", session.accessToken, "POST", prepared.body);
    } catch (error) {
      console.error("[listing-publish] indeterminate external result", error instanceof Error ? error.message : "unknown");
      return responseError("Não foi possível confirmar se o Mercado Livre recebeu a publicação. Não repita; confira a conta e os logs.", 502);
    }
    if (!response.response.ok) {
      await prisma.listingDraft.updateMany({
        where: { id: row.id, workspaceId: user.workspaceId, status: "PUBLISHING" },
        data: { status: "REVIEW", validation: {}, validatedAt: null },
      });
      return responseError("O Mercado Livre recusou a publicação. Corrija os dados e valide novamente.", 422, safeCauses(response.payload));
    }
    const product = response.payload as { id?: string; permalink?: string } | null;
    if (!product?.id || !/^MLB\d+$/.test(product.id)) {
      return responseError("A resposta foi inconclusiva. Não tente publicar novamente sem conferir os anúncios.", 502);
    }
    await prisma.listingDraft.updateMany({
      where: { id: row.id, workspaceId: user.workspaceId, status: "PUBLISHING" },
      data: { status: "PUBLISHED", mlItemId: product.id, publishedAt: new Date() },
    });
    // Description API failure does not retry the item POST, avoiding duplicates.
    let descriptionAdded = false;
    try {
      const desc = await mlJson("https://api.mercadolibre.com/items/" + product.id + "/description",
        session.accessToken, "POST", { plain_text: data.data.description });
      descriptionAdded = desc.response.ok;
    } catch { /* Leave item paused; user can fix description in seller center. */ }
    return NextResponse.json({
      published: true, paused: true, mlItemId: product.id,
      permalink: product.permalink ?? null, descriptionAdded,
      message: descriptionAdded
        ? "Anúncio criado PAUSADO. Revise no Mercado Livre antes de ativar."
        : "Anúncio criado PAUSADO, mas a descrição não foi confirmada. Revise no Mercado Livre.",
    });
  } catch (error) {
    console.error("[listing-publish] error", error instanceof Error ? error.message : "unknown");
    return responseError(error instanceof Error ? error.message : "Não foi possível validar o anúncio.", 502);
  }
}

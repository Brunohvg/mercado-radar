import { NextResponse } from "next/server";
import { z } from "zod";
import { getExtensionSession } from "@/lib/extension-auth";
import {
  getItemsBulkDetailed,
  getItemsByUserProduct,
  getUserProductDetails,
  MlApiError,
} from "@/lib/mercado-livre";
import { referenceIdSchema } from "@/lib/extension-observation";
import { prisma } from "@/lib/prisma";
import { getExtensionAnalytics } from "@/lib/extension-analytics";

export const dynamic = "force-dynamic";
const schema = z.object({
  id: referenceIdSchema,
  kind: z.enum(["ITEM", "USER_PRODUCT", "CATALOG"]).optional(),
  catalogProductId: z
    .string()
    .regex(/^MLB\d+$/i)
    .optional(),
  analyticsOnly: z.literal("1").optional(),
});

export async function GET(request: Request) {
  let session;
  try {
    session = await getExtensionSession(request);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Limite de consultas atingido.",
      },
      { status: 429 },
    );
  }
  if (!session)
    return NextResponse.json(
      { error: "Entre no Mercado Radar." },
      { status: 401 },
    );
  const url = new URL(request.url);
  const parsed = schema.safeParse({
    id: url.searchParams.get("id"),
    kind: url.searchParams.get("kind") ?? undefined,
    catalogProductId: url.searchParams.get("catalogProductId") ?? undefined,
    analyticsOnly: url.searchParams.get("analyticsOnly") ?? undefined,
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "Referência inválida." },
      { status: 400 },
    );
  const { id, kind } = parsed.data;
  const analytics = (
    resolvedItemId: string | null,
    catalogId?: string | null,
  ) =>
    getExtensionAnalytics({
      workspaceId: session.account.workspaceId,
      accountId: session.account.id,
      accessToken: session.ml.accessToken,
      itemId: kind === "CATALOG" ? null : resolvedItemId,
      catalogProductId:
        catalogId ||
        parsed.data.catalogProductId ||
        (kind === "CATALOG" ? id : null),
    });
  const partial = async (
    reason: string,
    upstreamStatus: number | null = null,
  ) =>
    NextResponse.json({
      referenceId: id,
      item: null,
      savedCost: null,
      availability: "PAGE_ONLY",
      restricted: upstreamStatus === 403,
      upstreamStatus,
      note: reason,
      catalog: null,
      analytics: null,
      trends: [],
    });
  if (parsed.data.analyticsOnly === "1")
    return NextResponse.json({
      analytics: await analytics(/^MLB\d+$/.test(id) ? id : null),
    });
  if (kind === "CATALOG")
    return partial(
      "Esta é uma página de catálogo. Selecione uma oferta para consultar um anúncio específico.",
    );
  try {
    let itemId = id;
    if (id.startsWith("MLBU")) {
      const product = await getUserProductDetails({
        accessToken: session.ml.accessToken,
        userProductId: id,
      });
      if (String(product.user_id ?? "") !== session.account.mercadoLivreUserId)
        return partial(
          "Produto de outro vendedor: os dados visíveis da página continuam disponíveis.",
        );
      const ids = await getItemsByUserProduct({
        accessToken: session.ml.accessToken,
        userId: session.account.mercadoLivreUserId,
        userProductId: id,
      });
      if (ids.length !== 1)
        return partial(
          "Há várias ofertas para este produto. Selecione um anúncio específico; o Radar não escolhe pelo preço.",
        );
      itemId = ids[0];
    }
    const result = await getItemsBulkDetailed({
      accessToken: session.ml.accessToken,
      itemIds: [itemId],
    });
    const item = result.items[0];
    if (!item)
      return partial(
        "A API não disponibilizou os detalhes desta oferta. Use os dados visíveis da página.",
        403,
      );
    const isOwn = item.sellerId === session.account.mercadoLivreUserId;
    let savedCost = null;
    if (isOwn) {
      const listing = await prisma.mercadoLivreProduct.findFirst({
        where: {
          mlItemId: item.id,
          sellerUserId: session.account.mercadoLivreUserId,
        },
        select: {
          supplierPrice: true,
          discountPercent: true,
          sku: true,
          updatedAt: true,
        },
      });
      const sku = listing?.sku || item.sellerSku;
      const product =
        listing?.supplierPrice == null && sku
          ? await prisma.product.findFirst({
              where: {
                workspaceId: session.account.workspaceId,
                sku,
                active: true,
              },
              select: {
                supplierPrice: true,
                discountPercent: true,
                updatedAt: true,
              },
            })
          : null;
      const cost = listing?.supplierPrice != null ? listing : product;
      if (cost && cost.supplierPrice != null)
        savedCost = {
          supplierPrice: Number(cost.supplierPrice),
          discountPercent: Number(cost.discountPercent),
          source: listing?.supplierPrice != null ? "LISTING" : "SKU",
          updatedAt: cost.updatedAt.toISOString(),
        };
    }
    return NextResponse.json({
      referenceId: id,
      resolvedItemId: item.id,
      availability: "API",
      source: "MERCADO_LIVRE_API",
      savedCost,
      analytics: null,
      item: {
        id: item.id,
        title: item.title,
        price: item.currentPrice,
        categoryId: item.categoryId,
        listingTypeId: item.listingTypeId,
        logisticType: item.logisticType,
        shippingPackage: item.shippingPackage,
        isOwn,
        sellerId: item.sellerId,
        soldQuantity: isOwn ? item.soldQuantity : null,
        availableQuantity: isOwn ? item.availableQuantity : null,
        dateCreated: item.dateCreated,
        freeShipping: item.freeShipping,
        catalogProductId: item.catalogProductId,
        userProductId: item.userProductId,
        permalink: item.permalink,
        thumbnail: item.thumbnail,
      },
      catalog: null,
      trends: [],
    });
  } catch (error) {
    const status = error instanceof MlApiError ? error.status : null;
    return partial(
      status === 401
        ? "A autorização do Mercado Livre precisa ser renovada em Integrações. A leitura da página continua disponível."
        : status === 429
          ? "A API limitou as consultas. Aguarde para tentar novamente; os dados da página continuam disponíveis."
          : "A API não liberou este recurso. Isso pode depender da conta, da oferta ou da política de acesso. A leitura da página continua disponível.",
      status,
    );
  }
}

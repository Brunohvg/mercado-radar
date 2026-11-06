import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/workspace-auth";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const dataSchema = z.object({
  name: z.string().trim().min(3).max(180),
  barcode: z.string().regex(/^\d{8,14}$/).nullable().optional(),
  brand: z.string().trim().max(90).default(""),
  sku: z.string().trim().max(100).default(""),
  categoryId: z.string().trim().max(40).default(""),
  categoryName: z.string().trim().max(180).default(""),
  catalogProductId: z.string().trim().max(50).nullable().optional(),
  publicationChannel: z.enum(["TRADITIONAL", "CATALOG"]).default("TRADITIONAL"),
  catalogExactMatchConfirmed: z.boolean().default(false),
  title: z.string().trim().max(120).default(""),
  description: z.string().trim().max(7500).default(""),
  confirmedFacts: z.string().trim().max(2000).default(""),
  missingFacts: z.array(z.string().max(180)).max(12).default([]),
  factsReviewed: z.boolean().default(false),
  imageUrls: z.array(z.string().max(1800).refine(v => v.startsWith("https://") || /^\/api\/listing-drafts\/photos\/[a-f0-9-]+\.(?:jpg|png|webp)$/.test(v), "Foto inválida")).max(12).default([]),
  attributes: z.record(z.string().max(100), z.string().trim().max(255)).default({}),
  stock: z.number().int().min(0).max(1000000).default(0),
  costPerUnit: z.number().nonnegative().finite().nullable().default(null),
  kitQuantity: z.number().int().min(1).max(1000).default(1),
  discountPercent: z.number().min(0).max(95).default(0),
  operatingCost: z.number().min(0).max(100000).default(0),
  listingType: z.enum(["CLASSIC", "PREMIUM"]).default("CLASSIC"),
  logisticType: z.enum(["drop_off", "cross_docking", "xd_drop_off", "fulfillment", "self_service"]).default("drop_off"),
  freeShipping: z.boolean().nullable().default(null),
  weightGrams: z.number().int().positive().max(100000).nullable().default(null),
  heightCm: z.number().positive().max(300).nullable().default(null),
  widthCm: z.number().positive().max(300).nullable().default(null),
  lengthCm: z.number().positive().max(300).nullable().default(null),
  suggestedPrice: z.number().positive().finite().nullable().default(null),
  profit: z.number().finite().nullable().default(null),
  marginPercent: z.number().finite().nullable().default(null),
}).strict();
const requestSchema = z.object({ id: z.string().cuid().optional(), data: dataSchema });
type ListingData = z.infer<typeof dataSchema>;

function review(data: ListingData) {
  const issues: string[] = [];
  if (!data.title || /^\d{8,14}$/.test(data.title)) issues.push("Confirme o título comercial do produto.");
  if (data.description.length < 60) issues.push("Complete a descrição técnica com dados confirmados.");
  if (!data.categoryId) issues.push("Confirme a categoria do Mercado Livre.");
  if (data.imageUrls.length === 0) issues.push("Adicione ao menos uma foto própria do produto.");
  if (data.stock < 1) issues.push("Informe o estoque disponível.");
  if (data.costPerUnit === null) issues.push("Informe o custo de compra.");
  if (data.suggestedPrice === null || data.profit === null) issues.push("Calcule preço, frete e lucro com a conta vinculada.");
  if (data.freeShipping === null || data.weightGrams === null ||
      data.heightCm === null || data.widthCm === null || data.lengthCm === null) {
    issues.push("Confirme frete e as medidas reais da embalagem.");
  }
  if (data.publicationChannel === "CATALOG" && !data.catalogExactMatchConfirmed) issues.push("Confirme a correspondência exata com a ficha de catálogo.");
  if (data.missingFacts.length && !data.factsReviewed) {
    issues.push("Revise e confirme as informações pendentes da IA.");
  }
  // Category-specific mandatory attributes and ML validation are not implemented.
  // A draft is never described as ready to publish without those checks.
  return issues;
}
function publicRow(row: { id: string; status: string; name: string; createdAt: Date; updatedAt: Date; content: unknown; mlItemId?: string | null }) {
  return { id: row.id, status: row.status, mlItemId: row.mlItemId ?? null, name: row.name, createdAt: row.createdAt, updatedAt: row.updatedAt, data: row.content };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const row = await prisma.listingDraft.findFirst({ where: { id, workspaceId: user.workspaceId } });
      return row ? NextResponse.json({ draft: publicRow(row) }) :
        NextResponse.json({ error: "Rascunho não encontrado." }, { status: 404 });
    }
    const rows = await prisma.listingDraft.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, status: true, name: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ drafts: rows }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar os rascunhos. Verifique sua sessão." }, { status: 401 });
  }
}

export async function POST(request: Request) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "Sessão expirada." }, { status: 401 }); }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os dados do rascunho antes de salvar.", details: parsed.error.issues.map(i => i.path.join(".")).slice(0, 8) }, { status: 400 });
  }
  try {
    const data = parsed.data.data;
    const issues = review(data);
    // Saving must never depend on a remote Mercado Livre response.
    // Required category attributes are verified at the explicit preflight step.
    const fields = {
      validation: {},
      validatedAt: null,
      name: data.name, barcode: data.barcode ?? null,
      sku: data.sku || null, categoryId: data.categoryId || null,
      content: data as Prisma.InputJsonValue,
      status: issues.length === 0 ? "REVIEW" : "DRAFT",
    };
    // UpdateMany ensures a guessed/cross-tenant ID can never mutate another workspace.
    let row;
    if (parsed.data.id) {
      const result = await prisma.listingDraft.updateMany({
        where: { id: parsed.data.id, workspaceId: user.workspaceId, status: { notIn: ["PUBLISHED", "PUBLISHING"] } },
        data: fields,
      });
      if (!result.count) return NextResponse.json({ error: "Rascunho inexistente ou já enviado ao Mercado Livre." }, { status: 409 });
      row = await prisma.listingDraft.findFirstOrThrow({ where: { id: parsed.data.id, workspaceId: user.workspaceId } });
    } else {
      row = await prisma.listingDraft.create({
        data: { ...fields, workspaceId: user.workspaceId, ownerId: user.id },
      });
    }
    return NextResponse.json({
      draft: publicRow(row),
      issues,
      message: "Rascunho salvo com sucesso. Revise as pendências antes de validar no Mercado Livre.",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[listing-drafts] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Falha ao salvar o rascunho." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/workspace-auth";
import { getWorkspaceSettings } from "@/lib/workspace-settings";
import type { CnpjCheck } from "@/lib/sourcing/cnpj";
import { qualifySupplier, type Qualification } from "@/lib/sourcing/qualification";
import {
  evaluateQuote,
  bestViability,
  recommendNextAction,
  type QuoteSource,
  type SaleContext,
  type Viability,
} from "@/lib/sourcing/viability";
import type { ListingType } from "@/lib/profitability";

export class SourcingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function sourcingUser() {
  const user = await getUserSession();
  if (!user)
    throw new SourcingError("Entre novamente no Vidalys Radar.", 401, "SESSION_REQUIRED");
  return user;
}

export function sourcingError(error: unknown, scope: string) {
  if (error instanceof SourcingError)
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof SyntaxError)
    return NextResponse.json({ error: "Dados inválidos.", code: "INVALID_INPUT" }, { status: 400 });
  console.error(`[sourcing/${scope}]`, error);
  return NextResponse.json(
    { error: "Não foi possível concluir agora. Tente novamente.", code: "INTERNAL" },
    { status: 500 },
  );
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>, max = 20000) {
  const text = await request.text();
  if (text.length > max) throw new SourcingError("Dados muito grandes.", 413, "PAYLOAD_LIMIT");
  const parsed = schema.safeParse(JSON.parse(text || "{}"));
  if (!parsed.success)
    throw new SourcingError(
      parsed.error.issues[0]?.message ?? "Revise os campos e tente novamente.",
      400,
      "INVALID_INPUT",
    );
  return parsed.data;
}

const money = z.number().finite().min(0).max(10_000_000);
const optMoney = money.nullable().optional();
const optInt = z.number().int().min(0).max(10_000_000).nullable().optional();
const optText = (max: number) => z.string().trim().max(max).nullable().optional();
const optBool = z.boolean().nullable().optional();

export const STATUSES = ["PESQUISANDO", "COTANDO", "VIAVEL", "DESCARTADA", "COMPRANDO"] as const;
export const SUPPLIER_KINDS = ["FABRICANTE", "DISTRIBUIDOR", "ATACADISTA", "IMPORTADOR", "LOJA_ML", "OUTRO"] as const;
export const QUOTE_SOURCES = ["COTACAO_RECEBIDA", "PRECO_PUBLICADO", "ESTIMATIVA_USUARIO"] as const;

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => /^https?:\/\//i.test(value), "Use um link que comece com http:// ou https://");

export const opportunitySchema = z.object({
  title: z.string().trim().min(2, "Informe o nome do produto.").max(200),
  mlItemId: z.string().trim().regex(/^MLBU?\d{5,15}$/i, "Código MLB inválido.").nullable().optional(),
  permalink: httpUrl.nullable().optional(),
  categoryId: optText(30),
  brand: optText(80),
  model: optText(80),
  gtin: optText(14),
  packQuantity: z.number().int().min(1).max(100000).nullable().optional(),
  referencePrice: optMoney,
  referenceSource: z.enum(["ANUNCIO", "MEDIANA_MERCADO", "MANUAL"]).nullable().optional(),
  listingType: z.enum(["CLASSIC", "PREMIUM"]).optional(),
  commissionPercent: z.number().min(0).max(60).nullable().optional(),
  fixedFee: optMoney,
  shippingCost: optMoney,
  taxPercent: z.number().min(0).max(40).nullable().optional(),
  operatingCost: optMoney,
  budget: optMoney,
  monthlyDemand: optInt,
  status: z.enum(STATUSES).optional(),
  notes: optText(4000),
  identity: z.unknown().optional(),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do fornecedor.").max(160),
  kind: z.enum(SUPPLIER_KINDS).optional(),
  cnpj: optText(20),
  website: httpUrl.nullable().optional(),
  phone: optText(40),
  email: z.string().trim().email("E-mail inválido.").max(160).nullable().optional(),
  city: optText(80),
  state: z.string().trim().length(2).toUpperCase().nullable().optional(),
  sellsToCpf: optBool,
  requiresCnpj: optBool,
  issuesInvoice: optBool,
  servesSmall: optBool,
  minOrderValue: optMoney,
  minOrderUnits: optInt,
  leadTimeDays: z.number().int().min(0).max(365).nullable().optional(),
  reputationNote: optText(600),
  origin: z.enum(["MANUAL", "BUSCA_WEB", "MERCADO_LIVRE"]).optional(),
  originUrl: httpUrl.nullable().optional(),
  notes: optText(4000),
});

export const quoteSchema = z.object({
  opportunityId: z.string().min(5).max(40),
  supplierId: z.string().min(5).max(40),
  unitPrice: z.number().finite().positive("Informe o preço por peça.").max(1_000_000),
  unitsPerPack: z.number().int().min(1).max(100000).optional(),
  minUnits: optInt,
  freightCost: optMoney,
  otherCosts: optMoney,
  exactMatch: optBool,
  source: z.enum(QUOTE_SOURCES),
  evidenceUrl: httpUrl.nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  notes: optText(2000),
});

const num = (value: unknown) =>
  value == null ? null : Number(value as number | string);

export async function loadOpportunityView(workspaceId: string, id: string) {
  const opportunity = await prisma.sourcingOpportunity.findFirst({
    where: { id, workspaceId },
    include: {
      quotes: { include: { supplier: true }, orderBy: { quotedAt: "desc" } },
    },
  });
  if (!opportunity)
    throw new SourcingError("Oportunidade não encontrada nesta conta.", 404, "NOT_FOUND");
  const settings = await getWorkspaceSettings(workspaceId);
  const sale: SaleContext = {
    salePrice: num(opportunity.referencePrice),
    saleUnits: opportunity.packQuantity,
    listingType: (opportunity.listingType as ListingType) ?? "CLASSIC",
    commissionPercent: num(opportunity.commissionPercent),
    fixedFee: num(opportunity.fixedFee),
    shippingCost: num(opportunity.shippingCost),
    taxPercent: num(opportunity.taxPercent) ?? num(settings.taxPercent),
    operatingCost: num(opportunity.operatingCost) ?? num(settings.operatingCostDefault),
    targetMarginPercent: Number(settings.targetMarginPercent),
    targetRoiPercent: Number(settings.targetRoiPercent),
    budget: num(opportunity.budget),
    monthlyDemand: opportunity.monthlyDemand,
  };

  const supplierIds = new Set(opportunity.quotes.map((q) => q.supplierId));
  const linkedSuppliers = await prisma.sourcingSupplier.findMany({
    where: { workspaceId, id: { in: [...supplierIds] } },
  });
  const candidateIds = opportunity.supplierIds.filter((value) => !supplierIds.has(value));
  const extra = candidateIds.length
    ? await prisma.sourcingSupplier.findMany({ where: { workspaceId, id: { in: candidateIds } } })
    : [];
  const suppliers = [...linkedSuppliers, ...extra];

  const viabilities: Viability[] = [];
  const quotes = opportunity.quotes.map((quote) => {
    const viability = evaluateQuote(sale, {
      id: quote.id,
      supplierId: quote.supplierId,
      supplierName: quote.supplier.name,
      unitPrice: Number(quote.unitPrice),
      unitsPerPack: quote.unitsPerPack,
      minUnits: quote.minUnits,
      freightCost: num(quote.freightCost),
      otherCosts: num(quote.otherCosts),
      source: quote.source as QuoteSource,
      exactMatch: quote.exactMatch,
      supplierMinOrderUnits: quote.supplier.minOrderUnits,
      supplierMinOrderValue: num(quote.supplier.minOrderValue),
    });
    viabilities.push(viability);
    return {
      id: quote.id,
      supplierId: quote.supplierId,
      unitPrice: Number(quote.unitPrice),
      unitsPerPack: quote.unitsPerPack,
      minUnits: quote.minUnits,
      freightCost: num(quote.freightCost),
      otherCosts: num(quote.otherCosts),
      exactMatch: quote.exactMatch,
      source: quote.source,
      evidenceUrl: quote.evidenceUrl,
      quotedAt: quote.quotedAt,
      validUntil: quote.validUntil,
      notes: quote.notes,
      viability,
    };
  });

  const supplierViews = suppliers.map((supplier) => {
    const latest = opportunity.quotes.find((q) => q.supplierId === supplier.id);
    const qualification: Qualification = qualifySupplier(
      {
        cnpj: supplier.cnpj,
        cnpjCheck: (supplier.cnpjCheck as CnpjCheck | null) ?? null,
        sellsToCpf: supplier.sellsToCpf,
        requiresCnpj: supplier.requiresCnpj,
        issuesInvoice: supplier.issuesInvoice,
        servesSmall: supplier.servesSmall,
        minOrderValue: num(supplier.minOrderValue),
        minOrderUnits: supplier.minOrderUnits,
        leadTimeDays: supplier.leadTimeDays,
        state: supplier.state,
        reputationNote: supplier.reputationNote,
      },
      latest
        ? {
            unitPrice: Number(latest.unitPrice),
            source: latest.source as QuoteSource,
            exactMatch: latest.exactMatch,
            freightCost: num(latest.freightCost),
          }
        : null,
    );
    return { ...serializeSupplier(supplier), qualification };
  });

  const best = bestViability(viabilities);
  return {
    opportunity: serializeOpportunity(opportunity),
    sale,
    suppliers: supplierViews,
    quotes,
    best,
    nextAction: recommendNextAction({
      sale,
      supplierCount: suppliers.length,
      quoteCount: quotes.length,
      best,
    }),
  };
}

type OpportunityRow = Awaited<ReturnType<typeof prisma.sourcingOpportunity.findFirst>> & object;
type SupplierRow = Awaited<ReturnType<typeof prisma.sourcingSupplier.findFirst>> & object;

export function serializeOpportunity(row: OpportunityRow) {
  return {
    id: row.id,
    title: row.title,
    mlItemId: row.mlItemId,
    permalink: row.permalink,
    categoryId: row.categoryId,
    brand: row.brand,
    model: row.model,
    gtin: row.gtin,
    packQuantity: row.packQuantity,
    referencePrice: num(row.referencePrice),
    referenceSource: row.referenceSource,
    referenceAt: row.referenceAt,
    listingType: row.listingType,
    commissionPercent: num(row.commissionPercent),
    fixedFee: num(row.fixedFee),
    shippingCost: num(row.shippingCost),
    taxPercent: num(row.taxPercent),
    operatingCost: num(row.operatingCost),
    budget: num(row.budget),
    monthlyDemand: row.monthlyDemand,
    status: row.status,
    notes: row.notes,
    identity: row.identity,
    searchSnapshot: row.searchSnapshot,
    supplierIds: row.supplierIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeSupplier(row: SupplierRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    cnpj: row.cnpj,
    website: row.website,
    phone: row.phone,
    email: row.email,
    city: row.city,
    state: row.state,
    sellsToCpf: row.sellsToCpf,
    requiresCnpj: row.requiresCnpj,
    issuesInvoice: row.issuesInvoice,
    servesSmall: row.servesSmall,
    minOrderValue: num(row.minOrderValue),
    minOrderUnits: row.minOrderUnits,
    leadTimeDays: row.leadTimeDays,
    reputationNote: row.reputationNote,
    origin: row.origin,
    originUrl: row.originUrl,
    cnpjCheck: row.cnpjCheck as CnpjCheck | null,
    cnpjCheckedAt: row.cnpjCheckedAt,
    notes: row.notes,
    updatedAt: row.updatedAt,
  };
}

export const noStore = { headers: { "Cache-Control": "private, no-store" } };

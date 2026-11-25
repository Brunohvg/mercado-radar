import { prisma } from "@/lib/prisma";
import type { z } from "zod";
import type { opportunitySchema } from "@/lib/sourcing/service";
import { extractIdentity } from "@/lib/sourcing/identity";
import { enrichFromMercadoLivre } from "@/lib/sourcing/ml-enrichment";
import { collectListingInsights } from "@/lib/sourcing/insights";
import type { Prisma } from "@/generated/prisma/client";

type Input = z.infer<typeof opportunitySchema>;

/** Cria (ou reabre) a oportunidade. Dados do usuário vencem os da API. */
export async function createOpportunity(
  workspaceId: string,
  input: Input,
  accessToken: string | null,
) {
  const mlItemId = input.mlItemId?.toUpperCase() ?? null;
  if (mlItemId) {
    const existing = await prisma.sourcingOpportunity.findFirst({
      where: { workspaceId, mlItemId, status: { not: "DESCARTADA" } },
      orderBy: { updatedAt: "desc" },
    });
    if (existing) return { opportunity: existing, reused: true, notes: [] as string[] };
  }
  const listingType = input.listingType ?? "CLASSIC";
  // Produto de usuário (MLBU) não tem /items; a página informa título e preço.
  const canEnrich = Boolean(mlItemId && /^MLB\d/.test(mlItemId) && accessToken);
  const [enrichment, insights] = canEnrich
    ? await Promise.all([
        enrichFromMercadoLivre({ accessToken: accessToken!, itemId: mlItemId!, listingType, fallbackTitle: input.title }),
        collectListingInsights(mlItemId!, accessToken).catch(() => null),
      ])
    : [null, null];
  const notes =
    enrichment?.notes ??
    (!mlItemId
      ? []
      : /^MLBU/.test(mlItemId)
        ? ["Produto de usuário (MLBU): identidade lida pelo título; marca e GTIN podem ser preenchidos manualmente."]
        : ["Mercado Livre não conectado; dados preenchidos só pela página."]);
  const identity =
    enrichment?.identity ?? extractIdentity({ title: input.title });
  const referencePrice = input.referencePrice ?? enrichment?.referencePrice ?? null;
  const opportunity = await prisma.sourcingOpportunity.create({
    data: {
      workspaceId,
      title: (enrichment?.title ?? input.title).slice(0, 200),
      mlItemId,
      permalink: input.permalink ?? null,
      categoryId: input.categoryId ?? enrichment?.categoryId ?? null,
      brand: input.brand ?? identity.brand,
      model: input.model ?? identity.model,
      gtin: input.gtin ?? identity.gtin,
      packQuantity: input.packQuantity ?? identity.packQuantity,
      referencePrice,
      referenceSource:
        input.referencePrice != null
          ? input.referenceSource ?? "MANUAL"
          : enrichment?.referencePrice != null
            ? "ANUNCIO"
            : null,
      referenceAt: referencePrice != null ? new Date() : null,
      listingType,
      commissionPercent: input.commissionPercent ?? enrichment?.commissionPercent ?? null,
      fixedFee: input.fixedFee ?? enrichment?.fixedFee ?? null,
      shippingCost: input.shippingCost ?? null,
      taxPercent: input.taxPercent ?? null,
      operatingCost: input.operatingCost ?? null,
      budget: input.budget ?? null,
      monthlyDemand: input.monthlyDemand ?? null,
      notes: input.notes ?? null,
      identity: JSON.parse(JSON.stringify({ ...identity, sourceNotes: notes })) as Prisma.InputJsonValue,
      ...(insights
        ? {
            marketInsights: JSON.parse(JSON.stringify(insights)) as Prisma.InputJsonValue,
            marketInsightsAt: new Date(insights.collectedAt),
          }
        : {}),
    },
  });
  return { opportunity, reused: false, notes };
}

import { prisma } from "@/lib/prisma";
import type { z } from "zod";
import type { opportunitySchema } from "@/lib/sourcing/service";
import { extractIdentity } from "@/lib/sourcing/identity";
import { enrichFromMercadoLivre } from "@/lib/sourcing/ml-enrichment";
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
  const enrichment =
    mlItemId && accessToken
      ? await enrichFromMercadoLivre({ accessToken, itemId: mlItemId, listingType, fallbackTitle: input.title })
      : null;
  const notes = enrichment?.notes ?? (mlItemId ? ["Mercado Livre não conectado; dados preenchidos só pela página."] : []);
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
    },
  });
  return { opportunity, reused: false, notes };
}

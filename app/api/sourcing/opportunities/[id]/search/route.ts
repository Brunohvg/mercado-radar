import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeIntelligenceRequest } from "@/lib/intelligence-access";
import { sourcingUser, sourcingError, SourcingError, noStore } from "@/lib/sourcing/service";
import { extractIdentity, isValidGtin, searchTermsFor, type ProductIdentity } from "@/lib/sourcing/identity";
import { braveProvider, searchSuppliers, withAiResearch } from "@/lib/sourcing/search";
import { aiSupplierSearchEnabled, runAiSupplierResearch } from "@/lib/sourcing/ai-research-run";
import type { ListingInsights } from "@/lib/marketplaces/types";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await sourcingUser();
    const { id } = await params;
    const opportunity = await prisma.sourcingOpportunity.findFirst({
      where: { id, workspaceId: user.workspaceId },
    });
    if (!opportunity)
      throw new SourcingError("Oportunidade não encontrada nesta conta.", 404, "NOT_FOUND");
    const stored = opportunity.identity as ProductIdentity | null;
    const identity: ProductIdentity = {
      ...(stored ?? extractIdentity({ title: opportunity.title })),
      title: opportunity.title,
      brand: opportunity.brand,
      model: opportunity.model,
      gtin: opportunity.gtin,
      gtinValid: opportunity.gtin ? isValidGtin(opportunity.gtin) : null,
      packQuantity: opportunity.packQuantity,
      searchTerms: searchTermsFor(opportunity),
    };
    if (opportunity.mlItemId && /^Anúncio MLBU?\d+$/i.test(identity.title)) {
      const fallback = await searchSuppliers(identity, null);
      return NextResponse.json({
        search: { ...fallback, status: "INDISPONIVEL", message: "Informe o nome do produto em Custos da venda para buscar fornecedores." },
      }, noStore);
    }
    const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
    const useAi = aiSupplierSearchEnabled();
    if (key || useAi) {
      try {
        await consumeIntelligenceRequest(user.workspaceId, user.workspace.dailyRequestLimit);
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "QUOTA") throw error;
        const fallback = await searchSuppliers(identity, null);
        return NextResponse.json({ search: { ...fallback, message: "Limite diário atingido. A pesquisa manual continua disponível." } }, noStore);
      }
    }
    let outcome = await searchSuppliers(identity, key ? braveProvider(key) : null);
    if (useAi) {
      const insights = opportunity.marketInsights as ListingInsights | null;
      const { research, candidates } = await runAiSupplierResearch(identity, {
        categoryPath: insights?.category?.data?.path ?? [],
      });
      outcome = withAiResearch(outcome, research, candidates);
    }
    if (outcome.status === "OK" || !opportunity.searchSnapshot) await prisma.sourcingOpportunity.updateMany({
      where: {
        id: opportunity.id,
        workspaceId: user.workspaceId,
        title: opportunity.title,
        brand: opportunity.brand,
        model: opportunity.model,
        gtin: opportunity.gtin,
        packQuantity: opportunity.packQuantity,
      },
      data: { searchSnapshot: JSON.parse(JSON.stringify(outcome)) as Prisma.InputJsonValue },
    });
    return NextResponse.json({ search: outcome }, noStore);
  } catch (error) {
    return sourcingError(error, "opportunities/search");
  }
}

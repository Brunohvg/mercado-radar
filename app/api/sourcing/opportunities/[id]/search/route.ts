import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeIntelligenceRequest } from "@/lib/intelligence-access";
import { sourcingUser, sourcingError, SourcingError, noStore } from "@/lib/sourcing/service";
import { extractIdentity, type ProductIdentity } from "@/lib/sourcing/identity";
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
      brand: opportunity.brand,
      model: opportunity.model,
      gtin: opportunity.gtin,
    };
    const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
    const useAi = aiSupplierSearchEnabled();
    if (key || useAi) await consumeIntelligenceRequest(user.workspaceId, user.workspace.dailyRequestLimit);
    let outcome = await searchSuppliers(identity, key ? braveProvider(key) : null);
    if (useAi) {
      const insights = opportunity.marketInsights as ListingInsights | null;
      const { research, candidates } = await runAiSupplierResearch(identity, {
        categoryPath: insights?.category?.data?.path ?? [],
      });
      outcome = withAiResearch(outcome, research, candidates);
    }
    await prisma.sourcingOpportunity.update({
      where: { id: opportunity.id },
      data: {
        searchSnapshot: JSON.parse(JSON.stringify(outcome)) as Prisma.InputJsonValue,
        status: opportunity.status === "PESQUISANDO" ? "COTANDO" : opportunity.status,
      },
    });
    return NextResponse.json({ search: outcome }, noStore);
  } catch (error) {
    if (error instanceof Error && "status" in error && (error as { code?: string }).code === "QUOTA")
      return NextResponse.json({ error: error.message, code: "QUOTA" }, { status: 429 });
    return sourcingError(error, "opportunities/search");
  }
}

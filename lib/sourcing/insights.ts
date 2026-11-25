/**
 * Sinais do marketplace para uma oportunidade: preço por quantidade, vendedor,
 * perguntas, opiniões e ficha da categoria. Lê pela camada de marketplaces,
 * então Shopee e outros entram sem mudar a tela.
 */
import { prisma } from "@/lib/prisma";
import { getMlSessionForAccount, getWorkspaceMlAccount } from "@/lib/mercado-livre";
import { adapterForListing } from "@/lib/marketplaces/registry";
import type { ListingInsights } from "@/lib/marketplaces/types";
import type { Prisma } from "@/generated/prisma/client";

export async function workspaceMlToken(workspaceId: string) {
  const account = await getWorkspaceMlAccount(workspaceId);
  if (!account) return null;
  try {
    return (await getMlSessionForAccount(account.id)).accessToken;
  } catch {
    return null;
  }
}

export async function collectListingInsights(
  listingId: string,
  accessToken: string | null,
): Promise<ListingInsights | null> {
  const adapter = adapterForListing(listingId.toUpperCase());
  if (!adapter) return null;
  return adapter.collectInsights({ accessToken }, listingId.toUpperCase());
}

export async function saveInsights(opportunityId: string, workspaceId: string, insights: ListingInsights) {
  await prisma.sourcingOpportunity.updateMany({
    where: { id: opportunityId, workspaceId },
    data: {
      marketInsights: JSON.parse(JSON.stringify(insights)) as Prisma.InputJsonValue,
      marketInsightsAt: new Date(insights.collectedAt),
    },
  });
}

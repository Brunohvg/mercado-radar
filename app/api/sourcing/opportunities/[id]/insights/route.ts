import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sourcingUser, sourcingError, SourcingError, noStore } from "@/lib/sourcing/service";
import { collectListingInsights, saveInsights, workspaceMlToken } from "@/lib/sourcing/insights";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** Atualiza os sinais do anúncio de referência (só leitura no marketplace). */
export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await sourcingUser();
    const { id } = await params;
    const opportunity = await prisma.sourcingOpportunity.findFirst({
      where: { id, workspaceId: user.workspaceId },
      select: { id: true, mlItemId: true },
    });
    if (!opportunity)
      throw new SourcingError("Oportunidade não encontrada nesta conta.", 404, "NOT_FOUND");
    if (!opportunity.mlItemId || !/^MLB\d/i.test(opportunity.mlItemId))
      throw new SourcingError(
        "Esta oportunidade não tem um anúncio do Mercado Livre (MLB) de referência.",
        422,
        "NO_LISTING",
      );
    const token = await workspaceMlToken(user.workspaceId);
    if (!token)
      throw new SourcingError("Conecte o Mercado Livre para ler os sinais do anúncio.", 409, "ML_NOT_CONNECTED");
    const insights = await collectListingInsights(opportunity.mlItemId, token);
    if (!insights) throw new SourcingError("Marketplace não reconhecido.", 422, "UNKNOWN_MARKETPLACE");
    await saveInsights(opportunity.id, user.workspaceId, insights);
    return NextResponse.json({ insights }, noStore);
  } catch (error) {
    return sourcingError(error, "opportunities/insights");
  }
}

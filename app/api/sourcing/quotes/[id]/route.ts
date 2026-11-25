import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sourcingUser, sourcingError, loadOpportunityView, SourcingError, noStore } from "@/lib/sourcing/service";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await sourcingUser();
    const { id } = await params;
    const quote = await prisma.sourcingQuote.findFirst({ where: { id, workspaceId: user.workspaceId } });
    if (!quote) throw new SourcingError("Cotação não encontrada nesta conta.", 404, "NOT_FOUND");
    await prisma.sourcingQuote.delete({ where: { id: quote.id } });
    return NextResponse.json(await loadOpportunityView(user.workspaceId, quote.opportunityId), noStore);
  } catch (error) {
    return sourcingError(error, "quotes/delete");
  }
}

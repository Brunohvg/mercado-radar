import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sourcingUser, sourcingError, readJson, quoteSchema, loadOpportunityView, SourcingError, noStore } from "@/lib/sourcing/service";

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

const updateSchema = quoteSchema.omit({ opportunityId: true, supplierId: true });

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await sourcingUser();
    const { id } = await params;
    const input = await readJson(request, updateSchema);
    const quote = await prisma.sourcingQuote.update({
      where: { id, workspaceId: user.workspaceId },
      data: { ...input, validUntil: input.validUntil ? new Date(input.validUntil) : input.validUntil },
      select: { opportunityId: true },
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "P2025")
        throw new SourcingError("Cotação não encontrada nesta conta.", 404, "NOT_FOUND");
      throw error;
    });
    return NextResponse.json(await loadOpportunityView(user.workspaceId, quote.opportunityId), noStore);
  } catch (error) {
    return sourcingError(error, "quotes/update");
  }
}

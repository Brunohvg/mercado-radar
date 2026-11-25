import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sourcingUser, sourcingError, readJson, quoteSchema, loadOpportunityView, SourcingError, noStore } from "@/lib/sourcing/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await sourcingUser();
    const input = await readJson(request, quoteSchema);
    const [opportunity, supplier] = await Promise.all([
      prisma.sourcingOpportunity.findFirst({ where: { id: input.opportunityId, workspaceId: user.workspaceId } }),
      prisma.sourcingSupplier.findFirst({ where: { id: input.supplierId, workspaceId: user.workspaceId } }),
    ]);
    if (!opportunity || !supplier)
      throw new SourcingError("Oportunidade ou fornecedor não encontrado nesta conta.", 404, "NOT_FOUND");
    await prisma.sourcingQuote.create({
      data: {
        ...input,
        unitsPerPack: input.unitsPerPack ?? 1,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        workspaceId: user.workspaceId,
      },
    });
    await prisma.sourcingOpportunity.update({
      where: { id: opportunity.id },
      data: {
        supplierIds: opportunity.supplierIds.includes(supplier.id)
          ? opportunity.supplierIds
          : [...opportunity.supplierIds, supplier.id],
        status: ["PESQUISANDO"].includes(opportunity.status) ? "COTANDO" : opportunity.status,
      },
    });
    return NextResponse.json(await loadOpportunityView(user.workspaceId, opportunity.id), { status: 201, ...noStore });
  } catch (error) {
    return sourcingError(error, "quotes/create");
  }
}

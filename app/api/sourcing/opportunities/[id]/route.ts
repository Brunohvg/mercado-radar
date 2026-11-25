import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  sourcingUser,
  sourcingError,
  readJson,
  opportunitySchema,
  loadOpportunityView,
  SourcingError,
  noStore,
} from "@/lib/sourcing/service";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await sourcingUser();
    const { id } = await params;
    return NextResponse.json(await loadOpportunityView(user.workspaceId, id), noStore);
  } catch (error) {
    return sourcingError(error, "opportunities/get");
  }
}

const patchSchema = opportunitySchema.partial().extend({
  supplierIds: z.array(z.string().min(5).max(40)).max(50).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await sourcingUser();
    const { id } = await params;
    const input = await readJson(request, patchSchema);
    const { identity: _identity, supplierIds, ...data } = input;
    if (supplierIds) {
      const owned = await prisma.sourcingSupplier.count({
        where: { workspaceId: user.workspaceId, id: { in: supplierIds } },
      });
      if (owned !== new Set(supplierIds).size)
        throw new SourcingError("Fornecedor não encontrado nesta conta.", 404, "NOT_FOUND");
    }
    const priceChanged = data.referencePrice !== undefined;
    const updated = await prisma.sourcingOpportunity.updateMany({
      where: { id, workspaceId: user.workspaceId },
      data: {
        ...data,
        ...(data.mlItemId ? { mlItemId: data.mlItemId.toUpperCase() } : {}),
        ...(supplierIds ? { supplierIds: [...new Set(supplierIds)] } : {}),
        ...(priceChanged
          ? {
              referenceAt: data.referencePrice == null ? null : new Date(),
              referenceSource: data.referencePrice == null ? null : data.referenceSource ?? "MANUAL",
            }
          : {}),
      },
    });
    if (!updated.count)
      throw new SourcingError("Oportunidade não encontrada nesta conta.", 404, "NOT_FOUND");
    return NextResponse.json(await loadOpportunityView(user.workspaceId, id), noStore);
  } catch (error) {
    return sourcingError(error, "opportunities/update");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await sourcingUser();
    const { id } = await params;
    const removed = await prisma.sourcingOpportunity.deleteMany({
      where: { id, workspaceId: user.workspaceId },
    });
    if (!removed.count)
      throw new SourcingError("Oportunidade não encontrada nesta conta.", 404, "NOT_FOUND");
    return NextResponse.json({ ok: true }, noStore);
  } catch (error) {
    return sourcingError(error, "opportunities/delete");
  }
}

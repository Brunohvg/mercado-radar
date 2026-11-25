import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  sourcingUser,
  sourcingError,
  readJson,
  supplierSchema,
  serializeSupplier,
  SourcingError,
  noStore,
} from "@/lib/sourcing/service";
import { normalizeCnpj, isValidCnpj } from "@/lib/sourcing/cnpj";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await sourcingUser();
    const rows = await prisma.sourcingSupplier.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: { _count: { select: { quotes: true } } },
    });
    return NextResponse.json(
      { suppliers: rows.map((row) => ({ ...serializeSupplier(row), quoteCount: row._count.quotes })) },
      noStore,
    );
  } catch (error) {
    return sourcingError(error, "suppliers/list");
  }
}

const id = z.string().min(5).max(40);
const createSchema = z.union([
  z.object({ supplierId: id, opportunityId: id }),
  supplierSchema.extend({ opportunityId: id.optional() }),
]);

export async function POST(request: Request) {
  try {
    const user = await sourcingUser();
    const data = await readJson(request, createSchema);
    if ("supplierId" in data) {
      const supplier = await prisma.sourcingSupplier.findFirst({
        where: { id: data.supplierId, workspaceId: user.workspaceId },
      });
      if (!supplier) throw new SourcingError("Fornecedor não encontrado nesta conta.", 404, "NOT_FOUND");
      await linkSupplier(user.workspaceId, data.opportunityId, supplier.id);
      return NextResponse.json({ supplier: serializeSupplier(supplier), reused: true }, noStore);
    }
    const { opportunityId, ...input } = data;
    const cnpj = input.cnpj ? normalizeCnpj(input.cnpj) : null;
    if (input.cnpj && (!cnpj || !isValidCnpj(cnpj)))
      throw new SourcingError("CNPJ inválido. Confira os 14 dígitos.", 400, "INVALID_INPUT");
    const opportunity = opportunityId
      ? await prisma.sourcingOpportunity.findFirst({
          where: { id: opportunityId, workspaceId: user.workspaceId },
          select: { id: true },
        })
      : null;
    if (opportunityId && !opportunity)
      throw new SourcingError("Oportunidade não encontrada nesta conta.", 404, "NOT_FOUND");
    const existing = cnpj
      ? await prisma.sourcingSupplier.findFirst({ where: { workspaceId: user.workspaceId, cnpj } })
      : input.originUrl
        ? await prisma.sourcingSupplier.findFirst({ where: { workspaceId: user.workspaceId, originUrl: input.originUrl } })
        : null;
    const supplier =
      existing ??
      (await prisma.sourcingSupplier.create({
        data: { ...input, cnpj, workspaceId: user.workspaceId },
      }));
    if (opportunity) await linkSupplier(user.workspaceId, opportunity.id, supplier.id);
    return NextResponse.json(
      { supplier: serializeSupplier(supplier), reused: Boolean(existing) },
      { status: existing ? 200 : 201, ...noStore },
    );
  } catch (error) {
    return sourcingError(error, "suppliers/create");
  }
}


async function linkSupplier(workspaceId: string, opportunityId: string, supplierId: string) {
  const where = { id: opportunityId, workspaceId };
  const linked = await prisma.sourcingOpportunity.updateMany({
    where: { ...where, NOT: { supplierIds: { has: supplierId } } },
    data: { supplierIds: { push: supplierId } },
  });
  if (!linked.count && !await prisma.sourcingOpportunity.count({ where }))
    throw new SourcingError("Produto não encontrado nesta conta.", 404, "NOT_FOUND");
}

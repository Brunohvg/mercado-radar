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

const createSchema = supplierSchema.extend({
  opportunityId: z.string().min(5).max(40).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await sourcingUser();
    const { opportunityId, ...input } = await readJson(request, createSchema);
    const cnpj = input.cnpj ? normalizeCnpj(input.cnpj) : null;
    if (input.cnpj && (!cnpj || !isValidCnpj(cnpj)))
      throw new SourcingError("CNPJ inválido. Confira os 14 dígitos.", 400, "INVALID_INPUT");
    const opportunity = opportunityId
      ? await prisma.sourcingOpportunity.findFirst({
          where: { id: opportunityId, workspaceId: user.workspaceId },
          select: { id: true, supplierIds: true },
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
    if (opportunity && !opportunity.supplierIds.includes(supplier.id))
      await prisma.sourcingOpportunity.update({
        where: { id: opportunity.id },
        data: { supplierIds: [...opportunity.supplierIds, supplier.id] },
      });
    return NextResponse.json(
      { supplier: serializeSupplier(supplier), reused: Boolean(existing) },
      { status: existing ? 200 : 201, ...noStore },
    );
  } catch (error) {
    return sourcingError(error, "suppliers/create");
  }
}

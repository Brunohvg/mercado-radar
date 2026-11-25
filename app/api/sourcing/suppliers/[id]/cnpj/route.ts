import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sourcingUser, sourcingError, serializeSupplier, SourcingError, noStore } from "@/lib/sourcing/service";
import { lookupCnpj, CnpjLookupError } from "@/lib/sourcing/cnpj";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const FRESH_MS = 24 * 60 * 60 * 1000;

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await sourcingUser();
    const { id } = await params;
    const supplier = await prisma.sourcingSupplier.findFirst({
      where: { id, workspaceId: user.workspaceId },
    });
    if (!supplier) throw new SourcingError("Fornecedor não encontrado nesta conta.", 404, "NOT_FOUND");
    if (!supplier.cnpj) throw new SourcingError("Informe o CNPJ do fornecedor antes de verificar.", 400, "INVALID_INPUT");
    if (supplier.cnpjCheckedAt && Date.now() - supplier.cnpjCheckedAt.getTime() < FRESH_MS)
      return NextResponse.json({ supplier: serializeSupplier(supplier), cached: true }, noStore);
    let check;
    try {
      check = await lookupCnpj(supplier.cnpj);
    } catch (error) {
      if (error instanceof CnpjLookupError)
        throw new SourcingError(error.message, error.code === "UNAVAILABLE" ? 503 : error.code === "NOT_FOUND" ? 404 : 400, error.code);
      throw error;
    }
    const updated = await prisma.sourcingSupplier.update({
      where: { id: supplier.id },
      data: {
        cnpjCheck: JSON.parse(JSON.stringify(check)) as Prisma.InputJsonValue,
        cnpjCheckedAt: new Date(check.checkedAt),
        city: supplier.city ?? check.city,
        state: supplier.state ?? check.state,
      },
    });
    return NextResponse.json({ supplier: serializeSupplier(updated), cached: false }, noStore);
  } catch (error) {
    return sourcingError(error, "suppliers/cnpj");
  }
}

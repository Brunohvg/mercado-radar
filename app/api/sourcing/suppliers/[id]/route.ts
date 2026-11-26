import { NextResponse } from "next/server";
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
type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await sourcingUser();
    const { id } = await params;
    const input = await readJson(request, supplierSchema.partial());
    const data: Record<string, unknown> = { ...input };
    if (input.cnpj !== undefined) {
      const cnpj = input.cnpj ? normalizeCnpj(input.cnpj) : null;
      if (input.cnpj && (!cnpj || !isValidCnpj(cnpj)))
        throw new SourcingError("CNPJ inválido. Confira os 14 dígitos.", 400, "INVALID_INPUT");
      const current = await prisma.sourcingSupplier.findFirst({
        where: { id, workspaceId: user.workspaceId },
        select: { cnpj: true },
      });
      data.cnpj = cnpj;
      // Uma verificação vale só para o CNPJ que foi consultado.
      if (current && current.cnpj !== cnpj) {
        data.cnpjCheck = null as never;
        data.cnpjCheckedAt = null;
      }
    }
    const updated = await prisma.sourcingSupplier.updateMany({
      where: { id, workspaceId: user.workspaceId },
      data,
    });
    if (!updated.count)
      throw new SourcingError("Fornecedor não encontrado nesta conta.", 404, "NOT_FOUND");
    const supplier = await prisma.sourcingSupplier.findUniqueOrThrow({ where: { id } });
    return NextResponse.json({ supplier: serializeSupplier(supplier) }, noStore);
  } catch (error) {
    return sourcingError(error, "suppliers/update");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await sourcingUser();
    const { id } = await params;
    const removed = await prisma.sourcingSupplier.deleteMany({
      where: { id, workspaceId: user.workspaceId },
    });
    if (!removed.count)
      throw new SourcingError("Fornecedor não encontrado nesta conta.", 404, "NOT_FOUND");
    return NextResponse.json({ ok: true }, noStore);
  } catch (error) {
    return sourcingError(error, "suppliers/delete");
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getMlSession } from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

// Renomeia, junta ou desvincula um fornecedor em todos os produtos da conta.
// O custo cadastrado fica como está: só o nome do fornecedor muda.
const schema = z.object({
  from: z.string().trim().min(1).max(120),
  to: z.string().trim().max(120).nullable(),
});

export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe o fornecedor atual e o novo nome." }, { status: 400 });
  try {
    const session = await getMlSession();
    const to = parsed.data.to?.trim() || null;
    const products = await prisma.mercadoLivreProduct.findMany({
      where: { sellerUserId: session.account.mercadoLivreUserId, supplier: { not: null } },
      select: { id: true, supplier: true },
    });
    const ids = products.filter((p) => p.supplier!.trim() === parsed.data.from).map((p) => p.id);
    if (!ids.length) return NextResponse.json({ error: "Fornecedor não encontrado nos seus produtos." }, { status: 404 });
    await prisma.mercadoLivreProduct.updateMany({ where: { id: { in: ids } }, data: { supplier: to } });
    return NextResponse.json({ ok: true, updated: ids.length, supplier: to });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao alterar fornecedor.";
    return NextResponse.json({ error: message }, { status: /sess|conect|login/i.test(message) ? 401 : 500 });
  }
}

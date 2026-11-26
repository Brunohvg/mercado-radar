import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCategoryAttributes, getItemsBulk, updateItem, updateItemDescription } from "@/lib/mercado-livre";
import { logPilotAction, pilotSession } from "@/lib/pilot/actions";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("field", [
  z.object({
    field: z.literal("title"),
    mlItemId: z.string().regex(/^MLB\d{5,}$/),
    title: z.string().trim().min(10).max(60),
    /** Título que o vendedor viu; se mudou no ML, não aplica. */
    expectedTitle: z.string(),
    confirm: z.literal(true),
  }),
  z.object({
    field: z.literal("description"),
    mlItemId: z.string().regex(/^MLB\d{5,}$/),
    description: z.string().trim().min(20).max(50_000),
    confirm: z.literal(true),
  }),
  z.object({
    field: z.literal("attributes"),
    mlItemId: z.string().regex(/^MLB\d{5,}$/),
    attributes: z
      .array(z.object({ id: z.string().regex(/^[A-Z0-9_]{2,60}$/), valueId: z.string().max(40).optional(), valueName: z.string().trim().min(1).max(255) }))
      .min(1)
      .max(30),
    confirm: z.literal(true),
  }),
]);

// ESCRITA: muda título, descrição ou ficha técnica do anúncio no Mercado Livre.
// Só com confirm=true, conferindo o dono direto no ML, e tudo fica registrado.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira o texto e confirme antes de aplicar." }, { status: 400 });
  let s;
  try { s = await pilotSession(); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sessão inválida." }, { status: 401 });
  }
  const input = parsed.data;
  const accessToken = s.ml.accessToken;
  try {
    const live = (await getItemsBulk({ accessToken, itemIds: [input.mlItemId] }))[0];
    if (!live || live.sellerId !== s.sellerId) return NextResponse.json({ error: "Anúncio não encontrado nesta conta." }, { status: 404 });
    if (!["active", "paused"].includes(live.status))
      return NextResponse.json({ error: "Só dá para alterar anúncio ativo ou pausado." }, { status: 422 });

    const base = { workspaceId: s.workspaceId, userId: s.user.id, sellerId: s.sellerId, kind: "IMPROVE_LISTING" as const, mlItemId: input.mlItemId };
    let before: unknown, after: unknown, write: () => Promise<unknown>;

    if (input.field === "title") {
      if (live.title !== input.expectedTitle)
        return NextResponse.json({ error: "O título mudou no Mercado Livre desde que você abriu a tela. Atualize e tente de novo.", live: { title: live.title } }, { status: 409 });
      if (input.title === live.title) return NextResponse.json({ error: "O título novo é igual ao atual." }, { status: 400 });
      before = { title: live.title };
      after = { title: input.title };
      write = () => updateItem({ accessToken, itemId: input.mlItemId, body: { title: input.title } });
    } else if (input.field === "description") {
      const text = input.description.replace(/<[^>]+>/g, "").trim();
      before = null;
      after = { descriptionLength: text.length };
      write = () => updateItemDescription({ accessToken, itemId: input.mlItemId, plainText: text });
    } else {
      if (!live.categoryId) return NextResponse.json({ error: "Anúncio sem categoria." }, { status: 422 });
      const allowed = new Map(
        (await getCategoryAttributes({ accessToken, categoryId: live.categoryId })).filter((a) => a.id).map((a) => [a.id!, a]),
      );
      const body: Array<Record<string, string>> = [];
      for (const a of input.attributes) {
        const spec = allowed.get(a.id);
        if (!spec || spec.tags?.read_only || spec.tags?.fixed)
          return NextResponse.json({ error: `O campo ${a.id} não pode ser preenchido nesta categoria.` }, { status: 422 });
        if (a.valueId) {
          if (!(spec.values ?? []).some((v) => v.id === a.valueId))
            return NextResponse.json({ error: `Valor inválido para ${spec.name ?? a.id}.` }, { status: 422 });
          body.push({ id: a.id, value_id: a.valueId });
        } else body.push({ id: a.id, value_name: a.valueName });
      }
      before = null;
      after = { attributes: input.attributes.map((a) => ({ id: a.id, value: a.valueName })) };
      write = () => updateItem({ accessToken, itemId: input.mlItemId, body: { attributes: body } });
    }

    try {
      await write();
    } catch (e) {
      let message = e instanceof Error ? e.message : "O Mercado Livre recusou a alteração.";
      if (input.field === "title" && live.soldQuantity > 0)
        message += " O Mercado Livre costuma bloquear a troca de título de anúncio que já vendeu; nesse caso melhore a ficha técnica e a descrição.";
      await logPilotAction({ ...base, before, after, status: "FAILED", error: message });
      return NextResponse.json({ error: message }, { status: 502 });
    }
    if (input.field === "title")
      await prisma.mercadoLivreProduct.updateMany({ where: { mlItemId: input.mlItemId, sellerUserId: s.sellerId }, data: { title: input.title } });
    await logPilotAction({ ...base, before, after, status: "DONE" });
    return NextResponse.json({ ok: true, field: input.field });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível alterar o anúncio." }, { status: 502 });
  }
}

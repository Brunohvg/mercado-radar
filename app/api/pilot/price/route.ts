import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getItemsBulk, updateItemPrice } from "@/lib/mercado-livre";
import { floorFor } from "@/lib/pilot/briefing";
import { priceGuard } from "@/lib/pilot/guards";
import { loadPilotData, PILOT_DAYS } from "@/lib/pilot/load";
import { logPilotAction, pilotSession } from "@/lib/pilot/actions";

export const dynamic = "force-dynamic";

const schema = z.object({
  mlItemId: z.string().regex(/^MLB\d{5,}$/),
  price: z.number().positive().max(1_000_000),
  /** Preço que o vendedor viu na tela; se mudou no ML, não aplica. */
  expectedCurrent: z.number().positive(),
  confirm: z.literal(true),
});

// ESCRITA: muda o preço do anúncio. Só com confirm=true e dentro do piso de margem.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirme o novo preço antes de aplicar." }, { status: 400 });
  let s;
  try { s = await pilotSession(); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sessão inválida." }, { status: 401 });
  }
  const { mlItemId, price, expectedCurrent } = parsed.data;
  try {
    const data = await loadPilotData({ workspaceId: s.workspaceId, sellerId: s.sellerId, mlItemId });
    const product = data.products[0];
    if (!product) return NextResponse.json({ error: "Anúncio não encontrado nesta conta." }, { status: 404 });
    // Confere o preço e o dono direto no Mercado Livre, não só no banco.
    const live = (await getItemsBulk({ accessToken: s.ml.accessToken, itemIds: [mlItemId] }))[0];
    if (!live || live.sellerId !== s.sellerId) return NextResponse.json({ error: "Anúncio não encontrado nesta conta." }, { status: 404 });
    const current = live.currentPrice;
    if (Math.abs(current - expectedCurrent) >= 0.005)
      return NextResponse.json({ error: `O preço no Mercado Livre agora é R$ ${current.toFixed(2).replace(".", ",")}. Atualize a tela antes de mudar.` }, { status: 409 });
    const floor = floorFor({ product: { ...product, price: current }, sales: data.sales, settings: data.settings, days: PILOT_DAYS });
    const blocked = priceGuard({ current, proposed: price, floor });
    if (blocked) return NextResponse.json({ error: blocked, floor }, { status: 422 });
    const base = { workspaceId: s.workspaceId, userId: s.user.id, sellerId: s.sellerId, kind: "UPDATE_PRICE" as const, mlItemId, before: { price: current }, after: { price, floor } };
    try {
      await updateItemPrice({ accessToken: s.ml.accessToken, itemId: mlItemId, price });
    } catch (e) {
      const message = e instanceof Error ? e.message : "O Mercado Livre recusou o novo preço.";
      await logPilotAction({ ...base, status: "FAILED", error: message });
      return NextResponse.json({ error: message }, { status: 502 });
    }
    await prisma.mercadoLivreProduct.updateMany({ where: { mlItemId, sellerUserId: s.sellerId }, data: { currentPrice: price } });
    await logPilotAction({ ...base, status: "DONE" });
    return NextResponse.json({ ok: true, mlItemId, before: current, after: price, floor });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível mudar o preço." }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getItemsBulk, updateItem } from "@/lib/mercado-livre";
import { floorFor } from "@/lib/pilot/briefing";
import { loadPilotData, PILOT_DAYS } from "@/lib/pilot/load";
import { logPilotAction, pilotSession } from "@/lib/pilot/actions";
import { planListingEdit } from "@/lib/listing-edit";

export const dynamic = "force-dynamic";

const schema = z.object({
  mlItemId: z.string().regex(/^MLB\d{5,}$/),
  price: z.number().positive().max(1_000_000).optional(),
  availableQuantity: z.number().int().min(0).max(99_999).optional(),
  status: z.enum(["active", "paused"]).optional(),
  /** O que o vendedor viu na tela; se mudou no ML desde então, não aplica. */
  expected: z.object({ price: z.number(), availableQuantity: z.number().int(), status: z.string() }),
  allowBelowFloor: z.boolean().default(false),
  confirm: z.literal(true),
  confirmVariationPrice: z.boolean().optional(),
});

// ESCRITA: edita preço, estoque e status do anúncio no Mercado Livre. Só com confirm=true,
// conferindo dono e valores atuais direto no ML, e tudo fica registrado.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira os valores e confirme antes de aplicar." }, { status: 400 });
  let s;
  try { s = await pilotSession(); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sessão inválida." }, { status: 401 });
  }
  const { mlItemId, expected } = parsed.data;
  try {
    const live = (await getItemsBulk({ accessToken: s.ml.accessToken, itemIds: [mlItemId] }))[0];
    if (!live || live.sellerId !== s.sellerId) return NextResponse.json({ error: "Anúncio não encontrado nesta conta." }, { status: 404 });
    if (Math.abs(live.currentPrice - expected.price) >= 0.005 || live.availableQuantity !== expected.availableQuantity || live.status !== expected.status)
      return NextResponse.json({ error: "O anúncio mudou no Mercado Livre desde que você abriu a tela. Atualize e tente de novo.", live: { price: live.currentPrice, availableQuantity: live.availableQuantity, status: live.status } }, { status: 409 });

    let floor: number | null = null;
    if (parsed.data.price != null) {
      const data = await loadPilotData({ workspaceId: s.workspaceId, sellerId: s.sellerId, mlItemId });
      const product = data.products[0];
      if (product) floor = floorFor({ product: { ...product, price: live.currentPrice }, sales: data.sales, settings: data.settings, days: PILOT_DAYS });
    }
    const variations = ((live.raw as { variations?: Array<{ id?: string | number }> })?.variations ?? [])
      .map((v) => v.id).filter((id): id is string | number => id != null);
    if (parsed.data.price != null && variations.length && !parsed.data.confirmVariationPrice)
      return NextResponse.json({
        error: `O novo preço será aplicado às ${variations.length} variações deste anúncio.`,
        variationCount: variations.length,
      }, { status: 422 });
    const plan = planListingEdit({
      live: { price: live.currentPrice, availableQuantity: live.availableQuantity, status: live.status, variationIds: variations },
      change: { price: parsed.data.price, availableQuantity: parsed.data.availableQuantity, status: parsed.data.status },
      floor,
      allowBelowFloor: parsed.data.allowBelowFloor,
    });
    if ("error" in plan) return NextResponse.json(plan, { status: plan.status });

    const before = { price: live.currentPrice, availableQuantity: live.availableQuantity, status: live.status };
    const base = { workspaceId: s.workspaceId, userId: s.user.id, sellerId: s.sellerId, kind: "EDIT_LISTING" as const, mlItemId, before, after: { ...plan.body, floor } };
    // Status vai numa chamada separada: o ML pode recusar status junto com outros campos.
    const { status, ...fields } = plan.body;
    const hasFields = Object.keys(fields).length > 0;
    const saveLocal = (withStatus: boolean) =>
      prisma.mercadoLivreProduct.updateMany({
        where: { mlItemId, sellerUserId: s.sellerId },
        data: {
          ...("price" in fields || "variations" in fields ? { currentPrice: parsed.data.price } : {}),
          ...("available_quantity" in fields ? { availableQuantity: parsed.data.availableQuantity } : {}),
          ...(withStatus && status ? { status: String(status) } : {}),
        },
      });
    let fieldsDone = false;
    try {
      if (hasFields) { await updateItem({ accessToken: s.ml.accessToken, itemId: mlItemId, body: fields }); fieldsDone = true; }
      if (status) await updateItem({ accessToken: s.ml.accessToken, itemId: mlItemId, body: { status } });
    } catch (e) {
      const reason = e instanceof Error ? e.message : "O Mercado Livre recusou a alteração.";
      const message = fieldsDone ? `Preço/estoque alterados, mas o status não: ${reason}` : reason;
      if (fieldsDone) await saveLocal(false);
      await logPilotAction({ ...base, status: "FAILED", error: message });
      return NextResponse.json({
        error: message,
        applied: fieldsDone ? {
          ...(parsed.data.price != null ? { currentPrice: parsed.data.price } : {}),
          ...(parsed.data.availableQuantity != null ? { availableQuantity: parsed.data.availableQuantity } : {}),
        } : undefined,
      }, { status: 502 });
    }
    await saveLocal(true);
    await logPilotAction({ ...base, status: "DONE" });
    return NextResponse.json({ ok: true, mlItemId, summary: plan.summary, floor });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível editar o anúncio." }, { status: 502 });
  }
}

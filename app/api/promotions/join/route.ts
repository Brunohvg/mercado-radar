import { NextResponse } from "next/server";
import { z } from "zod";
import { joinPromotion } from "@/lib/mercado-livre";
import { logPilotAction, pilotSession } from "@/lib/pilot/actions";
import { loadPromotionInvites } from "@/lib/promotions/run";
import { joinBody } from "@/lib/promotions/evaluate";

export const dynamic = "force-dynamic";

const schema = z.object({
  mlItemId: z.string().regex(/^MLB\d{5,}$/),
  promotionId: z.string().min(1).max(80),
  promotionType: z.string().min(2).max(40),
  /** Aceitar mesmo com margem abaixo da meta (nunca com prejuízo). */
  allowTight: z.boolean().default(false),
  confirm: z.literal(true),
});

// ESCRITA: coloca o anúncio na promoção. Recalcula o lucro no servidor e recusa prejuízo.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirme a promoção antes de aceitar." }, { status: 400 });
  let s;
  try { s = await pilotSession(); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sessão inválida." }, { status: 401 });
  }
  const { mlItemId, promotionId, promotionType } = parsed.data;
  try {
    const { invites } = await loadPromotionInvites({ accessToken: s.ml.accessToken, sellerId: s.sellerId, workspaceId: s.workspaceId });
    const invite = invites.find((i) => i.mlItemId === mlItemId && i.promotionId === promotionId && i.promotionType === promotionType);
    if (!invite) return NextResponse.json({ error: "Esse convite não está mais aberto para este anúncio." }, { status: 404 });
    if (!invite.joinable) return NextResponse.json({ error: "Este tipo de promoção é aceito direto no Mercado Livre." }, { status: 422 });
    if (invite.verdict === "SEM_DADOS") return NextResponse.json({ error: `Falta ${invite.missing.join(", ")} para saber se dá lucro.` }, { status: 422 });
    if (invite.verdict === "RECUSAR") return NextResponse.json({ error: `Nesta promoção você teria prejuízo: ${invite.formula}.` }, { status: 422 });
    if (invite.verdict === "APERTADO" && !parsed.data.allowTight)
      return NextResponse.json({ error: `Margem de ${invite.marginPercent}% fica abaixo da sua meta.`, tight: true }, { status: 422 });
    const body = joinBody(invite);
    const base = { workspaceId: s.workspaceId, userId: s.user.id, sellerId: s.sellerId, kind: "JOIN_PROMOTION" as const, mlItemId, targetId: promotionId,
      before: { price: invite.currentPrice }, after: { ...body, received: invite.received, profit: invite.profit } };
    try {
      await joinPromotion({ accessToken: s.ml.accessToken, itemId: mlItemId, body });
    } catch (e) {
      const message = e instanceof Error ? e.message : "O Mercado Livre recusou a entrada na promoção.";
      await logPilotAction({ ...base, status: "FAILED", error: message });
      return NextResponse.json({ error: message }, { status: 502 });
    }
    await logPilotAction({ ...base, status: "DONE" });
    return NextResponse.json({ ok: true, mlItemId, promotionId, dealPrice: invite.dealPrice, profit: invite.profit });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível aceitar a promoção." }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { pilotSession } from "@/lib/pilot/actions";
import { loadPromotionInvites } from "@/lib/promotions/run";

export const dynamic = "force-dynamic";

export async function GET() {
  let s;
  try { s = await pilotSession(); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sessão inválida." }, { status: 401 });
  }
  try {
    const result = await loadPromotionInvites({ accessToken: s.ml.accessToken, sellerId: s.sellerId, workspaceId: s.workspaceId });
    return NextResponse.json({ generatedAt: new Date().toISOString(), ...result }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível ler as promoções." }, { status: 502 });
  }
}

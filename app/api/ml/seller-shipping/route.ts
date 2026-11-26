import { NextResponse } from "next/server";
import { getMlSession } from "@/lib/mercado-livre";
import { loadSellerShippingProfile } from "@/lib/ml-seller-shipping";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await getMlSession();
    const result = await loadSellerShippingProfile(session.accessToken, session.account.mercadoLivreUserId);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro ao verificar logística.",
      verified: false, choices: [], source: "UNAVAILABLE",
    }, { status: 502 });
  }
}

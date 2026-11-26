import { NextResponse } from "next/server";
import { getMlSession } from "@/lib/mercado-livre";
import { loadSellerPublicationCapabilities } from "@/lib/ml-publication-capabilities";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getMlSession();
    const capabilities = await loadSellerPublicationCapabilities(
      session.accessToken, session.account.mercadoLivreUserId, session.account.scopes,
    );
    return NextResponse.json(capabilities, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Modelo de publicação indisponível." }, { status: 502 });
  }
}

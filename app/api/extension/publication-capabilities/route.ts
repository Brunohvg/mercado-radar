import { NextResponse } from "next/server";
import { getExtensionSession } from "@/lib/extension-auth";
import { loadSellerPublicationCapabilities } from "@/lib/ml-publication-capabilities";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getExtensionSession(request);
    if (!session) return NextResponse.json({ error: "Extensão não conectada." }, { status: 401 });
    const capabilities = await loadSellerPublicationCapabilities(
      session.ml.accessToken, session.account.mercadoLivreUserId, session.account.scopes,
    );
    return NextResponse.json(capabilities, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha no diagnóstico do vendedor." }, { status: 502 });
  }
}

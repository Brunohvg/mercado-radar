import { NextResponse } from "next/server";
import { getMlSession } from "@/lib/mercado-livre";
import { runHunterCached } from "@/lib/hunter/run";

export const dynamic = "force-dynamic";

// Caçador do próximo produto. Só leitura.
export async function GET(request: Request) {
  let session;
  try {
    session = await getMlSession();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Conecte o Mercado Livre em Integrações." }, { status: 409 });
  }
  try {
    const result = await runHunterCached({
      workspaceId: session.account.workspaceId,
      sellerId: session.account.mercadoLivreUserId,
      accessToken: session.accessToken,
      refresh: new URL(request.url).searchParams.get("refresh") === "1",
    });
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível buscar produtos agora." }, { status: 502 });
  }
}

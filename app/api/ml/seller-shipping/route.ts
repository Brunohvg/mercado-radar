import { NextResponse } from "next/server";
import { getMlSession } from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";
const ALLOWED = new Set(["drop_off", "xd_drop_off", "cross_docking", "fulfillment", "self_service"]);
const labels: Record<string, string> = {
  drop_off: "Agência Mercado Livre",
  xd_drop_off: "Mercado Envios Places",
  cross_docking: "Coleta Mercado Livre",
  fulfillment: "Envios Full",
  self_service: "Envios Flex",
};

export async function GET() {
  try {
    // Uses the logged-in workspace's OAuth access token. Never the developer's account.
    const session = await getMlSession();
    const sellerId = session.account.mercadoLivreUserId;
    const response = await fetch("https://api.mercadolibre.com/users/" + encodeURIComponent(sellerId) + "/shipping_preferences", {
      headers: { Authorization: "Bearer " + session.accessToken },
      cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("Mercado Livre recusou as preferências de envio (HTTP " + response.status + ").");
    const prefs = await response.json() as {
      modes?: string[]; logistics?: Array<{ mode?: string; types?: Array<{ type?: string; default?: boolean; status?: string }> }>;
      picking_type?: string | null;
    };
    if (!Array.isArray(prefs.modes) || !prefs.modes.includes("me2")) {
      return NextResponse.json({
        sellerId, choices: [], defaultType: null, verified: true,
        notice: "A conta vendedora não possui Mercado Envios 2 habilitado para este fluxo.",
      });
    }
    const choices = (prefs.logistics ?? [])
      .filter(group => group.mode === "me2")
      .flatMap(group => group.types ?? [])
      .filter(t => t.type && ALLOWED.has(t.type) && (t.status === undefined || t.status === "active"))
      .map(t => ({ type: t.type!, label: labels[t.type!], default: Boolean(t.default) }));
    const unique = [...new Map(choices.map(c => [c.type, c])).values()];
    // A missing logistics list must NOT be interpreted as every mode enabled.
    return NextResponse.json({
      sellerId, choices: unique,
      defaultType: unique.find(c => c.default)?.type ?? unique[0]?.type ?? null,
      verified: unique.length > 0,
      notice: unique.length > 0 ? "Logística consultada na conta vendedora conectada." :
        "A API não informou modalidades ME2 específicas. Não é possível confirmar a logística.",
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Falha ao consultar logística.",
      verified: false, choices: [],
    }, { status: 502 });
  }
}

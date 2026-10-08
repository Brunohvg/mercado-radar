import { NextResponse } from "next/server";
import { refreshRadarWatchlist } from "@/lib/radar-monitoring";
import { syncMercadoLivreProducts } from "@/lib/ml-sync";
import { pruneMarketSnapshots } from "@/lib/market-intel";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const configured = process.env.RADAR_CRON_SECRET?.trim();

  if (!configured) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = request.headers.get("authorization") ?? "";
  const headerSecret = request.headers.get("x-radar-cron-secret") ?? "";

  if (authorization.startsWith("Bearer ")) {
    return authorization.slice(7).trim() === configured;
  }

  return headerSecret === configured;
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const result = await refreshRadarWatchlist({ limit: 200 });

    // Série oficial dos seus anúncios (vendidos + visitas da API): calibra
    // conversão e idade usadas nas estimativas de concorrentes.
    const ownListings = await syncMercadoLivreProducts()
      .then((sync) => ({ ok: true, ...sync }))
      .catch((error: unknown) => ({
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao sincronizar anúncios.",
      }));
    const prunedSnapshots = await pruneMarketSnapshots().catch(() => 0);

    return NextResponse.json({
      ok: true,
      ...result,
      ownListings,
      prunedSnapshots,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha no monitoramento automático.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}

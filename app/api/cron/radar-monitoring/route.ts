import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { refreshRadarWatchlist } from "@/lib/radar-monitoring";
import { syncMercadoLivreProducts, syncMercadoLivreOrders } from "@/lib/ml-sync";
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
    const after = new URL(request.url).searchParams.get("after");
    const accounts = await prisma.mercadoLivreAccount.findMany({ where: { workspace: { active: true }, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: 10 });
    const results = [];
    for (const account of accounts) {
      try {
        const watchlist = await refreshRadarWatchlist({ limit: 200, accountId: account.id });
        const products = await syncMercadoLivreProducts(account.id);
        const orders = await syncMercadoLivreOrders(30, account.id);
        results.push({ accountId: account.id, ok: true, watchlist, products, orders });
      } catch {
        results.push({ accountId: account.id, ok: false, error: "Falha na sincronização desta conta. Verifique a integração e tente novamente." });
      }
    }
    const prunedSnapshots = await pruneMarketSnapshots().catch(() => 0);
    await prisma.radarUserSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return NextResponse.json({ ok: results.every((r) => r.ok), results, nextAfter: accounts.length === 10 ? accounts.at(-1)!.id : null, prunedSnapshots, executedAt: new Date().toISOString() });

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

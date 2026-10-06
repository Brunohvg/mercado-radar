import { NextResponse } from "next/server";
import { refreshRadarWatchlist } from "@/lib/radar-monitoring";

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

    return NextResponse.json({
      ok: true,
      ...result,
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

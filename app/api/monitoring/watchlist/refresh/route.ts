import { NextResponse } from "next/server";
import { refreshRadarWatchlist } from "@/lib/radar-monitoring";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await refreshRadarWatchlist();
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao atualizar monitoramento.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

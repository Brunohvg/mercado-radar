import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCalibration, getMarketInsights } from "@/lib/market-intel";

export const dynamic = "force-dynamic";

/**
 * Anúncios que o Radar já observou, com as estimativas atuais.
 * ?q= filtra por título ou ID · ?scope=market|own|all · ?limit= até 200
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const scope = url.searchParams.get("scope") ?? "market";
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit")) || 120));

  try {
    const where = {
      ...(scope === "own" ? { isOwn: true } : scope === "market" ? { isOwn: false } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { id: { equals: q.toUpperCase() } },
            ],
          }
        : {}),
    };

    const [rows, totals, state, snapshotCount] = await Promise.all([
      prisma.marketItem.findMany({
        where,
        orderBy: { lastSeenAt: "desc" },
        take: limit,
        select: { id: true },
      }),
      prisma.marketItem.groupBy({ by: ["isOwn"], _count: { _all: true } }),
      getCalibration(),
      prisma.marketItemSnapshot.count(),
    ]);

    const items = await getMarketInsights(rows.map((r) => r.id));

    return NextResponse.json({
      items,
      summary: {
        marketItems: totals.find((t) => !t.isOwn)?._count._all ?? 0,
        ownItems: totals.find((t) => t.isOwn)?._count._all ?? 0,
        snapshots: snapshotCount,
        withHistory: items.filter((i) => i.estimate.method === "HISTORICO").length,
      },
      calibration: {
        conversion: state.calibration.conversion,
        soldPerReview: state.calibration.soldPerReview,
        ageAnchors: state.anchors,
        ageModel: Boolean(state.idToDate),
      },
    });
  } catch (error) {
    console.error("[market/items]", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os anúncios observados. Confira se a migração do banco foi aplicada." },
      { status: 500 },
    );
  }
}

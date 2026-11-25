import { getWorkspaceId } from "@/lib/workspace-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCalibration, getMarketInsights } from "@/lib/market-intel";

import { getWorkspaceSettings } from "@/lib/workspace-settings";
import { purchaseLimit, sourcingSaleContext } from "@/lib/sourcing/service";

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
    const workspaceId = await getWorkspaceId();
    const where = {
      workspaceId,
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
      prisma.marketItem.groupBy({ where: { workspaceId }, by: ["isOwn"], _count: { _all: true } }),
      getCalibration(workspaceId),
      prisma.marketItemSnapshot.count({ where: { workspaceId } }),
    ]);

    const ids = rows.map(r => r.id);
    const [items, studies, settings] = await Promise.all([
      getMarketInsights(workspaceId, ids),
      prisma.sourcingOpportunity.findMany({
        where: { workspaceId, mlItemId: { in: ids }, status: { not: "DESCARTADA" } },
        orderBy: { updatedAt: "desc" }, distinct: ["mlItemId"],
        select: { mlItemId: true, referencePrice: true, packQuantity: true, listingType: true,
          commissionPercent: true, fixedFee: true, shippingCost: true, taxPercent: true,
          operatingCost: true, budget: true, monthlyDemand: true },
      }),
      getWorkspaceSettings(workspaceId),
    ]);
    const limits = new Map(studies.map(study => {
      const sale = sourcingSaleContext(study, settings);
      return [study.mlItemId, { ...purchaseLimit(sale), salePrice: sale.salePrice, target: sale.targetMarginPercent }];
    }));

    return NextResponse.json({
      items: items.map(item => ({ ...item, purchaseLimit: limits.get(item.id) ?? null })),
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

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getItemCurrentPrice,
  getItemsBulk,
  getItemsVisitTotals,
  getMlSession,
} from "@/lib/mercado-livre";
import { calculateRadarOpportunityScore } from "@/lib/radar-score";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getMlSession();
    const sellerUserId = session.account.mercadoLivreUserId;
    const watchItems = await prisma.radarWatchItem.findMany({
      where: { sellerUserId, active: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    if (watchItems.length === 0) {
      return NextResponse.json({ updated: 0, items: [] });
    }

    const itemIds = watchItems.map((item) => item.mlItemId);
    const [details, visits] = await Promise.all([
      getItemsBulk({
        accessToken: session.accessToken,
        itemIds,
      }),
      getItemsVisitTotals({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => ({} as Record<string, number>)),
    ]);

    const detailById = new Map(details.map((item) => [item.id, item]));
    const results = [];

    for (const watchItem of watchItems) {
      const item = detailById.get(watchItem.mlItemId);
      if (!item) continue;

      const currentPrice = await getItemCurrentPrice({
        accessToken: session.accessToken,
        itemId: item.id,
      }).catch(() => item.currentPrice || null);

      const itemVisits = visits[item.id] ?? null;
      const intelligence = calculateRadarOpportunityScore({
        price: currentPrice ?? 0,
        soldQuantity: item.soldQuantity,
        visits: itemVisits,
        dateCreated: item.dateCreated,
        freeShipping: item.freeShipping,
        listingTypeId: item.listingTypeId,
      });

      await prisma.$transaction([
        prisma.radarWatchItem.update({
          where: { id: watchItem.id },
          data: {
            title: item.title,
            permalink: item.permalink,
            thumbnail: item.thumbnail,
            currentPrice,
            score: intelligence.score,
            demandLabel: intelligence.demandLabel,
            soldQuantity: item.soldQuantity,
            visits: itemVisits,
            lastCheckedAt: new Date(),
          },
        }),
        prisma.radarWatchSnapshot.create({
          data: {
            watchItemId: watchItem.id,
            price: currentPrice,
            score: intelligence.score,
            demandLabel: intelligence.demandLabel,
            soldQuantity: item.soldQuantity,
            visits: itemVisits,
          },
        }),
      ]);

      results.push({
        mlItemId: item.id,
        price: currentPrice,
        score: intelligence.score,
        demandLabel: intelligence.demandLabel,
      });
    }

    return NextResponse.json({ updated: results.length, items: results });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao atualizar monitoramento.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { prisma } from "@/lib/prisma";
import {
  getItemsBulk,
  getItemsCurrentPrices,
  getItemsVisitTotals,
  getMlSession,
} from "@/lib/mercado-livre";
import { calculateRadarOpportunityScore } from "@/lib/radar-score";

type AlertInput = {
  kind: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
};

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

function priceChangePercent(previous: number | null, current: number | null) {
  if (previous == null || current == null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function createChangeAlerts(input: {
  title: string;
  previousPrice: number | null;
  currentPrice: number | null;
  previousScore: number | null;
  currentScore: number;
  previousDemand: string | null;
  currentDemand: string;
}): AlertInput[] {
  const alerts: AlertInput[] = [];
  const priceDelta = priceChangePercent(
    input.previousPrice,
    input.currentPrice,
  );

  if (
    priceDelta != null &&
    input.previousPrice != null &&
    input.currentPrice != null &&
    Math.abs(input.currentPrice - input.previousPrice) >= 1 &&
    Math.abs(priceDelta) >= 2
  ) {
    const wentDown = priceDelta < 0;
    alerts.push({
      kind: wentDown ? "PRICE_DOWN" : "PRICE_UP",
      severity: Math.abs(priceDelta) >= 10 ? "WARNING" : "INFO",
      title: wentDown ? "Preço caiu" : "Preço subiu",
      message:
        input.title +
        ": " +
        (wentDown ? "queda" : "alta") +
        " de " +
        Math.abs(round2(priceDelta)) +
        "% desde a última leitura.",
      metadata: {
        previousPrice: input.previousPrice,
        currentPrice: input.currentPrice,
        deltaPercent: round2(priceDelta),
      },
    });
  }

  if (
    input.previousScore != null &&
    Math.abs(input.currentScore - input.previousScore) >= 8
  ) {
    const improved = input.currentScore > input.previousScore;
    alerts.push({
      kind: improved ? "SCORE_UP" : "SCORE_DOWN",
      severity: improved ? "INFO" : "WARNING",
      title: improved ? "Score melhorou" : "Score caiu",
      message:
        input.title +
        ": Radar Score " +
        input.previousScore +
        " → " +
        input.currentScore +
        ".",
      metadata: {
        previousScore: input.previousScore,
        currentScore: input.currentScore,
      },
    });
  }

  if (
    input.previousDemand &&
    input.currentDemand &&
    input.previousDemand !== input.currentDemand
  ) {
    const demandOrder = ["BAIXA", "MEDIA", "ALTA", "EXCELENTE"];
    const previousIndex = demandOrder.indexOf(input.previousDemand);
    const currentIndex = demandOrder.indexOf(input.currentDemand);
    const improved = currentIndex > previousIndex;

    alerts.push({
      kind: improved ? "DEMAND_UP" : "DEMAND_DOWN",
      severity: improved ? "INFO" : "WARNING",
      title: improved ? "Demanda melhorou" : "Demanda enfraqueceu",
      message:
        input.title +
        ": demanda " +
        input.previousDemand +
        " → " +
        input.currentDemand +
        ".",
      metadata: {
        previousDemand: input.previousDemand,
        currentDemand: input.currentDemand,
      },
    });
  }

  return alerts;
}

export async function refreshRadarWatchlist(input?: { limit?: number }) {
  const session = await getMlSession();
  const sellerUserId = session.account.mercadoLivreUserId;
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 200);

  const watchItems = await prisma.radarWatchItem.findMany({
    where: { sellerUserId, active: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  if (watchItems.length === 0) {
    return { sellerUserId, updated: 0, alertsCreated: 0, items: [] };
  }

  const results: Array<{
    mlItemId: string;
    price: number | null;
    score: number;
    demandLabel: string;
    alertsCreated: number;
  }> = [];

  let alertsCreated = 0;

  for (let index = 0; index < watchItems.length; index += 50) {
    const batch = watchItems.slice(index, index + 50);
    const itemIds = batch.map((item) => item.mlItemId);

    const [details, prices, visits] = await Promise.all([
      getItemsBulk({
        accessToken: session.accessToken,
        itemIds,
      }),
      getItemsCurrentPrices({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => ({} as Record<string, number | null>)),
      getItemsVisitTotals({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => ({} as Record<string, number>)),
    ]);

    const detailById = new Map(details.map((item) => [item.id, item]));

    for (const watchItem of batch) {
      const item = detailById.get(watchItem.mlItemId);
      if (!item) continue;

      const currentPrice =
        prices[item.id] ??
        (item.currentPrice > 0 ? item.currentPrice : null);
      const itemVisits = visits[item.id] ?? null;

      const intelligence = calculateRadarOpportunityScore({
        price: currentPrice ?? 0,
        soldQuantity: item.soldQuantity,
        visits: itemVisits,
        dateCreated: item.dateCreated,
        freeShipping: item.freeShipping,
        listingTypeId: item.listingTypeId,
      });

      const alerts = createChangeAlerts({
        title: item.title,
        previousPrice:
          watchItem.currentPrice == null
            ? null
            : Number(watchItem.currentPrice),
        currentPrice,
        previousScore: watchItem.score,
        currentScore: intelligence.score,
        previousDemand: watchItem.demandLabel,
        currentDemand: intelligence.demandLabel,
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
        ...alerts.map((alert) =>
          prisma.radarAlert.create({
            data: {
              sellerUserId,
              watchItemId: watchItem.id,
              kind: alert.kind,
              severity: alert.severity,
              title: alert.title,
              message: alert.message,
              metadata: alert.metadata,
            },
          }),
        ),
      ]);

      alertsCreated += alerts.length;
      results.push({
        mlItemId: item.id,
        price: currentPrice,
        score: intelligence.score,
        demandLabel: intelligence.demandLabel,
        alertsCreated: alerts.length,
      });
    }
  }

  return {
    sellerUserId,
    updated: results.length,
    alertsCreated,
    items: results,
  };
}

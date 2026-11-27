import { apiSold, VALIDATED_COUNTER, demandEvidence, snapshotDue } from "@/lib/competitor-sales-velocity";
import { prisma } from "@/lib/prisma";
import {
  getItemsBulk,
  getItemsCurrentPrices,
  getItemsVisitTotals,
  getMlSession,
  getMlSessionForAccount,
} from "@/lib/mercado-livre";
import { calculateRadarOpportunityScore } from "@/lib/radar-score";

type AlertInput = {
  kind: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
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
  currentScore: number | null;
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
    input.currentScore != null && input.previousScore != null &&
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

export async function refreshRadarWatchlist(input?: {
  limit?: number;
  accountId?: string;
}) {
  const session = input?.accountId
    ? await getMlSessionForAccount(input.accountId)
    : await getMlSession();
  const sellerUserId = session.account.mercadoLivreUserId;
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 200);

  const watchItems = await prisma.radarWatchItem.findMany({
    where: { sellerUserId, active: true, trackingMode: "API" },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  if (watchItems.length === 0) {
    return { sellerUserId, updated: 0, alertsCreated: 0, items: [] };
  }

  const results: Array<{
    mlItemId: string;
    price: number | null;
    score: number | null;
    demandLabel: string | null;
    alertsCreated: number;
  }> = [];

  let alertsCreated = 0;
  let unavailable = 0;

  for (let index = 0; index < watchItems.length; index += 50) {
    const batch = watchItems.slice(index, index + 50);
    const itemIds = batch.map((item) => item.mlItemId);

    const [details, prices, visits] = await Promise.all([
      getItemsBulk({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => []),
      getItemsCurrentPrices({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => ({}) as Record<string, number | null>),
      getItemsVisitTotals({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => ({}) as Record<string, number>),
    ]);

    const detailById = new Map(details.map((item) => [item.id, item]));

    for (const watchItem of batch) {
      const item = detailById.get(watchItem.mlItemId);
      if (!item) {
        unavailable++;
        // Rotate failed items as well; lastCheckedAt stays the last successful reading.
        await prisma.radarWatchItem.updateMany({ where: { id: watchItem.id, active: true, updatedAt: watchItem.updatedAt }, data: { updatedAt: new Date() } });
        continue;
      }

      const currentPrice =
        prices[item.id] ?? (item.currentPrice > 0 ? item.currentPrice : null);
      const itemVisits = visits[item.id] ?? null;
      const reported = apiSold(item.raw);

      const intelligence = calculateRadarOpportunityScore({
        price: currentPrice ?? 0,
        soldQuantity: reported,
        visits: itemVisits,
        dateCreated: item.dateCreated,
        freeShipping: item.freeShipping,
        listingTypeId: item.listingTypeId,
      });

      const score = demandEvidence(reported, intelligence.score, watchItem.score);
      const demandLabel = demandEvidence(reported, intelligence.demandLabel, watchItem.demandLabel);
      const alerts = createChangeAlerts({
        title: item.title,
        previousPrice:
          watchItem.currentPrice == null
            ? null
            : Number(watchItem.currentPrice),
        currentPrice,
        previousScore: watchItem.soldKnown ? watchItem.score : null,
        currentScore: reported === null ? null : score,
        previousDemand: watchItem.soldKnown ? watchItem.demandLabel : null,
        currentDemand: reported === null ? "" : demandLabel ?? "",
      });

      const written = await prisma.$transaction(async tx => {
        const now = new Date();
        const changed = await tx.radarWatchItem.updateMany({ where: { id: watchItem.id, active: true, trackingMode: "API", updatedAt: watchItem.updatedAt }, data: {
          title: item.title, permalink: item.permalink, thumbnail: item.thumbnail, currentPrice, score, demandLabel,
          soldQuantity: reported ?? 0, soldKnown: reported !== null, soldIsLowerBound: false, visits: itemVisits, lastCheckedAt: now,
        } });
        if (!changed.count) return false;
        const latest = await tx.radarWatchSnapshot.findFirst({ where: { watchItemId: watchItem.id }, orderBy: { capturedAt: "desc" } });
        const snapshot = { price: currentPrice, soldQuantity: reported ?? 0, soldKnown: reported !== null, soldIsLowerBound: false, visits: itemVisits };
        if (snapshotDue(latest, snapshot, now)) await tx.radarWatchSnapshot.create({ data: { ...snapshot, watchItemId: watchItem.id, score: reported === null ? null : score, demandLabel: reported === null ? null : demandLabel, trackingMode: VALIDATED_COUNTER, capturedAt: now } });
        const date = item.dateCreated ? new Date(item.dateCreated) : null;
        if (date && Number.isFinite(date.getTime()) && date <= now) await tx.marketItem.upsert({ where: { workspaceId_id: { workspaceId: session.account.workspaceId, id: item.id } }, create: { workspaceId: session.account.workspaceId, id: item.id, title: item.title, dateCreated: date, isOwn: item.sellerId === sellerUserId }, update: { dateCreated: date } });
        for (const alert of alerts) await tx.radarAlert.create({ data: { sellerUserId, watchItemId: watchItem.id, ...alert } });
        return true;
      });
      if (!written) continue;

      alertsCreated += alerts.length;
      results.push({
        mlItemId: item.id,
        price: currentPrice,
        score,
        demandLabel,
        alertsCreated: alerts.length,
      });
    }
  }

  return {
    sellerUserId,
    updated: results.length,
    attempted: watchItems.length,
    unavailable,
    alertsCreated,
    items: results,
  };
}

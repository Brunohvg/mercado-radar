import { prisma } from "@/lib/prisma";
import { apiSold, VALIDATED_COUNTER, snapshotDue, demandEvidence } from "@/lib/competitor-sales-velocity";
import { calculateRadarOpportunityScore } from "@/lib/radar-score";
import type { SellerItemDetail } from "@/lib/mercado-livre";
export async function saveApiWatch(input: { sellerUserId: string; workspaceId: string; item: SellerItemDetail; price: number | null; visits: number | null; referenceId?: string }) {
  const { item, sellerUserId, workspaceId, price, visits } = input;
  const reported = apiSold(item.raw);
  const computed = calculateRadarOpportunityScore({ price: price ?? 0, soldQuantity: reported, visits, dateCreated: item.dateCreated, freeShipping: item.freeShipping, listingTypeId: item.listingTypeId });
  const now = new Date();
  return prisma.$transaction(async tx => {
    const key = { sellerUserId_mlItemId: { sellerUserId, mlItemId: item.id } };
    // Upsert acquires the row lock; subsequent reads and snapshot decision are serialized.
    const data = { title: item.title, permalink: item.permalink, thumbnail: item.thumbnail, currentPrice: price, soldQuantity: reported ?? 0, soldKnown: reported !== null, soldIsLowerBound: false, trackingMode: "API", visits, active: true, lastCheckedAt: now };
    const watch = await tx.radarWatchItem.upsert({
      where: key,
      create: { sellerUserId, mlItemId: item.id, referenceId: input.referenceId ?? null, ...data, score: demandEvidence(reported, computed.score, null), demandLabel: demandEvidence(reported, computed.demandLabel, null) },
      update: { ...data, referenceId: input.referenceId, score: reported === null ? undefined : computed.score, demandLabel: reported === null ? undefined : computed.demandLabel },
    });
    const latest = await tx.radarWatchSnapshot.findFirst({ where: { watchItemId: watch.id }, orderBy: { capturedAt: "desc" } });
    const snapshot = { price, soldQuantity: reported ?? 0, soldKnown: reported !== null, soldIsLowerBound: false, visits };
    if (snapshotDue(latest, snapshot, now)) await tx.radarWatchSnapshot.create({ data: { ...snapshot, watchItemId: watch.id, score: reported === null ? null : computed.score, demandLabel: reported === null ? null : computed.demandLabel, trackingMode: VALIDATED_COUNTER, capturedAt: now } });
    const date = item.dateCreated ? new Date(item.dateCreated) : null;
    if (date && Number.isFinite(date.getTime()) && date <= now) await tx.marketItem.upsert({ where: { workspaceId_id: { workspaceId, id: item.id } }, create: { workspaceId, id: item.id, title: item.title, dateCreated: date, isOwn: item.sellerId === sellerUserId }, update: { dateCreated: date } });
    return watch;
  });
}

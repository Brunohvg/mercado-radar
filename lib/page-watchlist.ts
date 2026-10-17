import { prisma } from "@/lib/prisma";
import type { ObservedListing } from "@/lib/market-intel";

/** No ML API is needed to save a dated page reading. It never promises background access. */
export async function savePageWatch(
  sellerUserId: string,
  observed: ObservedListing,
  create = false,
) {
  const key = {
    sellerUserId_mlItemId: { sellerUserId, mlItemId: observed.id },
  };
  const existing = await prisma.radarWatchItem.findUnique({
    where: key,
    include: {
      snapshots: {
        take: 1,
        orderBy: { capturedAt: "desc" },
        select: { capturedAt: true },
      },
    },
  });
  if (!create && (!existing?.active || existing.trackingMode !== "PAGE"))
    return null;
  if (create && existing?.active && existing.trackingMode === "API")
    return existing;
  const now = new Date();
  const soldKnown = observed.soldLower != null;
  const data = {
    title: observed.title,
    referenceId: observed.id,
    permalink: observed.permalink ?? null,
    thumbnail: observed.thumbnail ?? null,
    currentPrice: observed.price,
    score: null,
    demandLabel: null,
    visits: null,
    soldQuantity: observed.soldLower ?? 0,
    soldKnown,
    soldIsLowerBound: soldKnown && observed.soldHasPlus !== false,
    trackingMode: "PAGE",
    active: true,
    lastCheckedAt: now,
  };
  const changed =
    !existing ||
    (existing.currentPrice == null ? null : Number(existing.currentPrice)) !==
      observed.price ||
    existing.soldQuantity !== data.soldQuantity ||
    existing.soldKnown !== soldKnown ||
    existing.soldIsLowerBound !== data.soldIsLowerBound;
  const snapshot =
    changed ||
    now.getTime() - (existing?.snapshots[0]?.capturedAt.getTime() ?? 0) >=
      6 * 3600_000;
  const watch = await prisma.radarWatchItem.upsert({
    where: key,
    create: { sellerUserId, mlItemId: observed.id, ...data },
    update: data,
  });
  if (snapshot)
    await prisma.radarWatchSnapshot.create({
      data: {
        watchItemId: watch.id,
        price: observed.price,
        soldQuantity: data.soldQuantity,
        soldKnown,
        soldIsLowerBound: data.soldIsLowerBound,
        trackingMode: "PAGE",
      },
    });
  return watch;
}

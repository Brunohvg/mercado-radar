/**
 * Inteligência de mercado: grava as leituras de anúncios e calcula as
 * estimativas a partir do histórico. Toda regra de estimativa está em
 * lib/market-estimates.ts (puro e testável); aqui só há banco de dados.
 */
import { prisma } from "@/lib/prisma";
import {
  buildIdDateModel,
  DEFAULT_CALIBRATION,
  demandFrom,
  estimateItem,
  itemNumber,
  marketScore,
  median,
  quantile,
  soldRangeFromLabel,
  type AgeHint,
  type Calibration,
  type ItemEstimate,
  type Observation,
  type OfficialFacts,
} from "@/lib/market-estimates";

const DAY_MS = 86_400_000;
const SNAPSHOT_MIN_GAP_MS = 6 * 60 * 60 * 1000;
const OWN_SNAPSHOT_MIN_GAP_MS = 20 * 60 * 60 * 1000;
const OFFICIAL_WINDOW_DAYS = 30;

export type ObservedListing = {
  id: string;
  title: string;
  price: number | null;
  originalPrice?: number | null;
  soldLower?: number | null;
  soldHasPlus?: boolean;
  soldLabel?: string | null;
  reviews?: number | null;
  rating?: number | null;
  freeShipping?: boolean;
  fulfillment?: boolean;
  bestSellerRank?: number | null;
  bestSellerLabel?: string | null;
  catalogProductId?: string | null;
  sellerName?: string | null;
  condition?: string | null;
  thumbnail?: string | null;
  permalink?: string | null;
  position?: number | null;
};

export type ObservationSource = "SEARCH_CARD" | "PRODUCT_PAGE" | "OWN_API";

const toNum = (value: unknown) => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------------ */
/* gravação                                                            */
/* ------------------------------------------------------------------ */

/**
 * Registra o que a página mostrou. Uma leitura nova por anúncio a cada 6 h,
 * ou antes disso se preço, faixa de vendidos ou avaliações mudaram.
 */
export async function recordObservations(input: {
  source: ObservationSource;
  query?: string | null;
  listings: ObservedListing[];
}) {
  const listings = dedupeById(input.listings);
  if (!listings.length) return { saved: 0 };

  const ids = listings.map((l) => l.id);
  const now = new Date();

  const [existing, own] = await Promise.all([
    prisma.marketItem.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        lastPrice: true,
        lastSoldLower: true,
        lastReviews: true,
        lastSnapshotAt: true,
      },
    }),
    prisma.mercadoLivreProduct.findMany({
      where: { mlItemId: { in: ids } },
      select: { mlItemId: true },
    }),
  ]);

  const ownSet = new Set(own.map((o) => o.mlItemId));
  const lastById = new Map(existing.map((e) => [e.id, e]));
  const snapshots: Array<{
    itemId: string;
    observedAt: Date;
    source: ObservationSource;
    price: number | null;
    soldLower: number | null;
    soldUpper: number | null;
    reviews: number | null;
    rating: number | null;
    bestSellerRank: number | null;
    searchQuery: string | null;
    searchPosition: number | null;
  }> = [];
  const writes = [];

  for (const l of listings) {
    const sold = soldRangeFromLabel(l.soldLower ?? null, l.soldHasPlus ?? true);
    const last = lastById.get(l.id);
    const changed =
      !last ||
      toNum(last.lastPrice) !== (l.price ?? null) ||
      (last.lastSoldLower ?? null) !== (sold.lower ?? null) ||
      (last.lastReviews ?? null) !== (l.reviews ?? null);
    const due =
      !last?.lastSnapshotAt ||
      now.getTime() - last.lastSnapshotAt.getTime() >= SNAPSHOT_MIN_GAP_MS;
    const takeSnapshot = due || changed;

    const data = {
      title: l.title.slice(0, 300),
      permalink: l.permalink ?? undefined,
      thumbnail: l.thumbnail ?? undefined,
      catalogProductId: l.catalogProductId ?? undefined,
      sellerName: l.sellerName ?? undefined,
      condition: l.condition ?? undefined,
      lastPrice: l.price ?? undefined,
      lastOriginalPrice: l.originalPrice ?? null,
      lastSoldLower: sold.lower ?? undefined,
      lastSoldUpper: sold.upper ?? undefined,
      lastSoldLabel: l.soldLabel ?? undefined,
      lastReviews: l.reviews ?? undefined,
      lastRating: l.rating ?? undefined,
      freeShipping: Boolean(l.freeShipping),
      fulfillment: Boolean(l.fulfillment),
      bestSellerRank: l.bestSellerRank ?? null,
      bestSellerLabel: l.bestSellerLabel ?? null,
      isOwn: ownSet.has(l.id),
      lastSeenAt: now,
      ...(takeSnapshot ? { lastSnapshotAt: now } : {}),
    };

    // upsert (ON CONFLICT): duas abas enviando o mesmo anúncio novo não colidem
    writes.push(
      prisma.marketItem.upsert({
        where: { id: l.id },
        update: { ...data, ...(takeSnapshot ? { observationCount: { increment: 1 } } : {}) },
        create: { id: l.id, ...data, observationCount: 1, firstSeenAt: now, lastSnapshotAt: now },
      }),
    );

    if (takeSnapshot) {
      snapshots.push({
        itemId: l.id,
        observedAt: now,
        source: input.source,
        price: l.price ?? null,
        soldLower: sold.lower,
        soldUpper: sold.upper,
        reviews: l.reviews ?? null,
        rating: l.rating ?? null,
        bestSellerRank: l.bestSellerRank ?? null,
        searchQuery: input.query?.slice(0, 180) ?? null,
        searchPosition: l.position ?? null,
      });
    }
  }

  await prisma.$transaction(writes);

  if (snapshots.length) {
    await prisma.marketItemSnapshot.createMany({ data: snapshots });
  }

  return { saved: snapshots.length };
}

function dedupeById(listings: ObservedListing[]) {
  const map = new Map<string, ObservedListing>();
  for (const l of listings) {
    const id = l.id.toUpperCase();
    if (!/^MLB\d{6,}$/.test(id)) continue;
    map.set(id, { ...map.get(id), ...l, id });
  }
  return [...map.values()];
}

/**
 * Leitura oficial dos anúncios da própria conta (chamada após a sincronização
 * de produtos): vendidos exatos e visitas totais da API.
 */
export async function recordOwnListings(
  items: Array<{
    id: string;
    title: string;
    price: number | null;
    soldQuantity: number;
    visitsTotal: number | null;
    dateCreated: string | null;
    permalink: string | null;
    thumbnail: string | null;
    categoryId: string | null;
    catalogProductId: string | null;
    sellerId: string | null;
    freeShipping: boolean;
    fulfillment: boolean;
  }>,
) {
  const now = new Date();
  const known = await prisma.marketItem.findMany({
    where: { id: { in: items.map((i) => i.id) } },
    select: { id: true, lastSoldLower: true, lastPrice: true, lastSnapshotAt: true },
  });
  const knownById = new Map(known.map((k) => [k.id, k]));

  for (const item of items) {
    const last = knownById.get(item.id);
    const takeSnapshot =
      !last?.lastSnapshotAt ||
      now.getTime() - last.lastSnapshotAt.getTime() >= OWN_SNAPSHOT_MIN_GAP_MS ||
      last.lastSoldLower !== item.soldQuantity ||
      toNum(last.lastPrice) !== item.price;
    const created = item.dateCreated ? new Date(item.dateCreated) : null;
    const data = {
      title: item.title.slice(0, 300),
      permalink: item.permalink,
      thumbnail: item.thumbnail,
      categoryId: item.categoryId,
      catalogProductId: item.catalogProductId,
      sellerId: item.sellerId,
      lastPrice: item.price,
      lastSoldLower: item.soldQuantity,
      lastSoldUpper: item.soldQuantity,
      freeShipping: item.freeShipping,
      fulfillment: item.fulfillment,
      dateCreated: created && !Number.isNaN(created.getTime()) ? created : null,
      isOwn: true,
      lastSeenAt: now,
      ...(takeSnapshot ? { lastSnapshotAt: now } : {}),
    };

    await prisma.marketItem.upsert({
      where: { id: item.id },
      update: { ...data, ...(takeSnapshot ? { observationCount: { increment: 1 } } : {}) },
      create: { id: item.id, ...data, observationCount: 1, firstSeenAt: now, lastSnapshotAt: now },
    });

    if (!takeSnapshot) continue;
    await prisma.marketItemSnapshot.create({
      data: {
        itemId: item.id,
        observedAt: now,
        source: "OWN_API",
        price: item.price,
        soldExact: item.soldQuantity,
        soldLower: item.soldQuantity,
        soldUpper: item.soldQuantity,
        visitsTotal: item.visitsTotal,
      },
    });
  }
}

/* ------------------------------------------------------------------ */
/* calibração (cache de 15 min por processo)                           */
/* ------------------------------------------------------------------ */

type CalibrationState = {
  calibration: Calibration;
  idToDate: ((id: number) => number | null) | null;
  anchors: number;
  expiresAt: number;
};

let calibrationCache: CalibrationState | null = null;

export async function getCalibration(): Promise<CalibrationState> {
  if (calibrationCache && calibrationCache.expiresAt > Date.now()) return calibrationCache;

  const [own, dated, reviewed] = await Promise.all([
    prisma.mercadoLivreProduct.findMany({
      select: { mlItemId: true, listingCreatedAt: true, soldQuantity: true, visitsTotal: true },
      take: 2000,
    }),
    prisma.marketItem.findMany({
      where: { dateCreated: { not: null } },
      select: { id: true, dateCreated: true },
      take: 5000,
    }),
    prisma.marketItem.findMany({
      where: { lastReviews: { gte: 20 }, lastSoldLower: { gte: 100 }, isOwn: false },
      select: { lastReviews: true, lastSoldLower: true, lastSoldUpper: true },
      take: 5000,
    }),
  ]);

  // conversão: anúncios próprios com volume suficiente
  const conversions = own
    .filter((p) => (p.visitsTotal ?? 0) >= 200 && p.soldQuantity >= 5)
    .map((p) => p.soldQuantity / (p.visitsTotal as number))
    .filter((c) => c > 0 && c < 0.5);

  const conversion =
    conversions.length >= 3
      ? {
          value: median(conversions)!,
          low: Math.max(0.002, quantile(conversions, 0.25)!),
          high: Math.min(0.4, quantile(conversions, 0.75)!),
          source: "SUA_CONTA" as const,
          sample: conversions.length,
        }
      : DEFAULT_CALIBRATION.conversion;

  // vendidos por avaliação: anúncios observados com muitas avaliações
  const ratios = reviewed
    .map((r) => {
      const lower = r.lastSoldLower ?? 0;
      const upper = r.lastSoldUpper ?? lower;
      return Math.sqrt(Math.max(1, lower) * Math.max(1, upper)) / (r.lastReviews as number);
    })
    .filter((r) => r >= 3 && r <= 300);

  const soldPerReview =
    ratios.length >= 20
      ? {
          value: median(ratios)!,
          low: quantile(ratios, 0.25)!,
          high: quantile(ratios, 0.75)!,
          sample: ratios.length,
        }
      : DEFAULT_CALIBRATION.soldPerReview;

  // idade pelo número do anúncio
  const anchors = [
    ...own
      .filter((p) => p.listingCreatedAt)
      .map((p) => ({ id: itemNumber(p.mlItemId), at: p.listingCreatedAt!.getTime() })),
    ...dated.map((d) => ({ id: itemNumber(d.id), at: d.dateCreated!.getTime() })),
  ].filter((a): a is { id: number; at: number } => a.id != null);
  const uniqueAnchors = [...new Map(anchors.map((a) => [a.id, a])).values()];

  calibrationCache = {
    calibration: { conversion, soldPerReview },
    idToDate: buildIdDateModel(uniqueAnchors),
    anchors: uniqueAnchors.length,
    expiresAt: Date.now() + 15 * 60_000,
  };
  return calibrationCache;
}

/* ------------------------------------------------------------------ */
/* estimativas                                                         */
/* ------------------------------------------------------------------ */

export type MarketItemInsight = {
  id: string;
  title: string;
  permalink: string | null;
  thumbnail: string | null;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  soldLabel: string | null;
  freeShipping: boolean;
  fulfillment: boolean;
  bestSellerLabel: string | null;
  isOwn: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  estimate: ItemEstimate;
  score: number;
  demand: ReturnType<typeof demandFrom>;
};

async function officialFactsFor(ids: string[], ageById: Map<string, number | null>) {
  const facts = new Map<string, OfficialFacts>();
  if (!ids.length) return facts;

  const lastOrdersSync = await prisma.syncRun.findFirst({
    where: { kind: "ML_ORDERS", status: "SUCCESS" },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true, metadata: true },
  });
  const meta = (lastOrdersSync?.metadata ?? {}) as { days?: number; truncated?: boolean };
  const usable =
    lastOrdersSync?.finishedAt &&
    Date.now() - lastOrdersSync.finishedAt.getTime() <= 3 * DAY_MS &&
    Number(meta.days ?? 0) >= OFFICIAL_WINDOW_DAYS &&
    meta.truncated === false;
  // Sem uma sincronização completa de 30 dias, não dá para chamar de "oficial":
  // o anúncio cai para histórico ou estimativa.
  if (!usable) return facts;

  const since = new Date(Date.now() - OFFICIAL_WINDOW_DAYS * DAY_MS);
  const grouped = await prisma.mercadoLivreOrderItem.groupBy({
    by: ["mlItemId"],
    where: {
      mlItemId: { in: ids },
      order: { is: { dateCreated: { gte: since }, status: { notIn: ["cancelled", "invalid"] } } },
    },
    _sum: { quantity: true },
  });

  for (const id of ids) {
    const row = grouped.find((g) => g.mlItemId === id);
    const age = ageById.get(id);
    const windowDays = Math.max(1, Math.min(OFFICIAL_WINDOW_DAYS, Math.floor(age ?? OFFICIAL_WINDOW_DAYS)));
    facts.set(id, {
      unitsInWindow: row?._sum.quantity ?? 0,
      windowDays,
    });
  }
  return facts;
}

function visitsPerDayFromSnapshots(snaps: Array<{ observedAt: Date; visitsTotal: number | null }>) {
  const withVisits = snaps.filter((s) => s.visitsTotal != null);
  if (withVisits.length < 2) return null;
  const first = withVisits[0];
  const last = withVisits[withVisits.length - 1];
  const days = (last.observedAt.getTime() - first.observedAt.getTime()) / DAY_MS;
  if (days < 3) return null;
  return Math.max(0, (last.visitsTotal! - first.visitsTotal!) / days);
}

export async function getMarketInsights(ids: string[]): Promise<MarketItemInsight[]> {
  const unique = [...new Set(ids.map((id) => id.toUpperCase()))].slice(0, 200);
  if (!unique.length) return [];

  const since = new Date(Date.now() - 120 * DAY_MS);
  const [items, snapshots, state] = await Promise.all([
    prisma.marketItem.findMany({ where: { id: { in: unique } } }),
    prisma.marketItemSnapshot.findMany({
      where: { itemId: { in: unique }, observedAt: { gte: since } },
      orderBy: { observedAt: "asc" },
      select: {
        itemId: true,
        observedAt: true,
        price: true,
        soldLower: true,
        soldUpper: true,
        soldExact: true,
        reviews: true,
        visitsTotal: true,
      },
    }),
    getCalibration(),
  ]);

  const ownIds = items.filter((i) => i.isOwn).map((i) => i.id);
  const official = await officialFactsFor(
    ownIds,
    new Map(
      items
        .filter((i) => i.isOwn)
        .map((i) => [i.id, i.dateCreated ? (Date.now() - i.dateCreated.getTime()) / DAY_MS : null]),
    ),
  );

  const snapsById = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const list = snapsById.get(s.itemId) ?? [];
    list.push(s);
    snapsById.set(s.itemId, list);
  }

  const byId = new Map(items.map((i) => [i.id, i]));

  return unique
    .map((id) => byId.get(id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .map((item) => {
      const snaps = snapsById.get(item.id) ?? [];
      const observations: Observation[] = snaps.map((s) => ({
        at: s.observedAt,
        price: toNum(s.price),
        soldLower: s.soldLower,
        soldUpper: s.soldUpper,
        soldExact: s.soldExact,
        reviews: s.reviews,
        visitsTotal: s.visitsTotal,
      }));

      let age: AgeHint | null = null;
      if (item.dateCreated) {
        age = { days: (Date.now() - item.dateCreated.getTime()) / DAY_MS, source: "API" };
      } else if (state.idToDate) {
        const n = itemNumber(item.id);
        const at = n == null ? null : state.idToDate(n);
        if (at != null && at < Date.now()) {
          age = { days: (Date.now() - at) / DAY_MS, source: "ID_ESTIMADO" };
        }
      }

      let facts = official.get(item.id) ?? null;
      if (facts) {
        const visitsPerDay = visitsPerDayFromSnapshots(snaps);
        if (visitsPerDay != null) {
          facts = { ...facts, visitsInWindow: Math.round(visitsPerDay * (facts.windowDays ?? OFFICIAL_WINDOW_DAYS)) };
        }
      }

      const price = toNum(item.lastPrice);
      const estimate = estimateItem({
        observations,
        price,
        age,
        calibration: state.calibration,
        official: facts,
      });
      const rating = toNum(item.lastRating);

      return {
        id: item.id,
        title: item.title,
        permalink: item.permalink,
        thumbnail: item.thumbnail,
        price,
        rating,
        reviews: item.lastReviews,
        soldLabel: item.lastSoldLabel,
        freeShipping: item.freeShipping,
        fulfillment: item.fulfillment,
        bestSellerLabel: item.bestSellerLabel,
        isOwn: item.isOwn,
        firstSeenAt: item.firstSeenAt.toISOString(),
        lastSeenAt: item.lastSeenAt.toISOString(),
        estimate,
        score: marketScore({
          estimate,
          rating,
          freeShipping: item.freeShipping,
          fulfillment: item.fulfillment,
        }),
        demand: demandFrom(estimate),
      };
    });
}

/** Série temporal de um anúncio para gráficos. */
export async function getMarketItemHistory(id: string) {
  const itemId = id.toUpperCase();
  const [item, snapshots] = await Promise.all([
    prisma.marketItem.findUnique({ where: { id: itemId } }),
    prisma.marketItemSnapshot.findMany({
      where: { itemId },
      orderBy: { observedAt: "desc" },
      take: 500,
    }),
  ]);
  if (!item) return null;
  snapshots.reverse();

  const [insight] = await getMarketInsights([itemId]);
  return {
    insight,
    series: snapshots.map((s) => ({
      at: s.observedAt.toISOString(),
      source: s.source,
      price: toNum(s.price),
      soldLower: s.soldLower,
      soldUpper: s.soldUpper,
      soldExact: s.soldExact,
      reviews: s.reviews,
      visitsTotal: s.visitsTotal,
      searchQuery: s.searchQuery,
      searchPosition: s.searchPosition,
    })),
  };
}

/**
 * Retenção: leituras antigas não mudam mais nenhuma estimativa (a janela é de
 * até 120 dias). Mantém 1 ano para gráficos e apaga o resto.
 */
export async function pruneMarketSnapshots(days = 365) {
  const before = new Date(Date.now() - days * DAY_MS);
  const result = await prisma.marketItemSnapshot.deleteMany({
    where: { observedAt: { lt: before } },
  });
  return result.count;
}

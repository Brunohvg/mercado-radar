import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isExtensionAuthorized } from "@/lib/extension-auth";
import {
  getItemsBulk,
  getItemsVisitTotals,
  getMlSession,
} from "@/lib/mercado-livre";
import { calculateRadarOpportunityScore } from "@/lib/radar-score";
import { calculateRadarMomentum } from "@/lib/radar-momentum";

export const dynamic = "force-dynamic";

const observedItemSchema = z.object({
  id: z.string().trim().regex(/^MLB\d+$/i),
  title: z.string().trim().min(1).max(300),
  price: z.number().positive().nullable(),
  position: z.number().int().min(1).max(100),
  soldQuantityLowerBound: z.number().int().min(0).nullable(),
  freeShipping: z.boolean().default(false),
  logisticType: z.string().trim().max(60).nullable(),
});

const schema = z.object({
  query: z.string().trim().min(2).max(180),
  items: z.array(observedItemSchema).min(1).max(50),
});

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function round2(value: number | null) {
  return value == null
    ? null
    : Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function POST(request: Request) {
  if (!isExtensionAuthorized(request)) {
    return NextResponse.json(
      {
        error:
          "Extensão não autorizada. Confira a chave configurada no Mercado Radar.",
      },
      { status: 401 },
    );
  }

  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "A página do Mercado Livre não forneceu anúncios válidos para enriquecer.",
        items: [],
      },
      { status: 400 },
    );
  }

  try {
    const session = await getMlSession();
    const observed = parsed.data.items;
    const itemIds = observed.map((item) => item.id.toUpperCase());

    const [details, visits, watched] = await Promise.all([
      getItemsBulk({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => []),
      getItemsVisitTotals({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => ({} as Record<string, number>)),
      prisma.radarWatchItem.findMany({
        where: {
          sellerUserId: session.account.mercadoLivreUserId,
          active: true,
          mlItemId: { in: itemIds },
        },
        include: {
          snapshots: {
            orderBy: { capturedAt: "desc" },
            take: 24,
          },
        },
      }),
    ]);

    const detailById = new Map(details.map((item) => [item.id, item]));
    const watchByItemId = new Map(
      watched.map((watch) => [
        watch.mlItemId,
        {
          id: watch.id,
          momentum: calculateRadarMomentum(
            watch.snapshots.map((snapshot) => ({
              score: snapshot.score,
              demandLabel: snapshot.demandLabel,
              soldQuantity: snapshot.soldQuantity,
              visits: snapshot.visits,
              capturedAt: snapshot.capturedAt,
            })),
          ),
        },
      ]),
    );

    const items = observed.map((visible) => {
      const itemId = visible.id.toUpperCase();
      const detail = detailById.get(itemId);
      const itemVisits = visits[itemId] ?? null;

      const apiSoldQuantity =
        detail?.soldQuantity != null && detail.soldQuantity > 0
          ? detail.soldQuantity
          : null;
      const soldQuantity =
        apiSoldQuantity ?? visible.soldQuantityLowerBound ?? 0;

      const price =
        visible.price != null && visible.price > 0
          ? visible.price
          : detail?.currentPrice ?? 0;

      const intelligence = calculateRadarOpportunityScore({
        price,
        soldQuantity,
        visits: itemVisits,
        dateCreated: detail?.dateCreated ?? null,
        freeShipping:
          visible.freeShipping || Boolean(detail?.freeShipping),
        listingTypeId: detail?.listingTypeId ?? null,
      });

      const watch = watchByItemId.get(itemId) ?? null;

      return {
        id: itemId,
        title: visible.title || detail?.title || itemId,
        price,
        searchPosition: visible.position,
        categoryId: detail?.categoryId ?? null,
        sellerId: detail?.sellerId ?? null,
        listingTypeId: detail?.listingTypeId ?? null,
        freeShipping:
          visible.freeShipping || Boolean(detail?.freeShipping),
        logisticType:
          detail?.logisticType ?? visible.logisticType ?? null,
        soldQuantity,
        soldQuantityIsLowerBound:
          apiSoldQuantity == null &&
          visible.soldQuantityLowerBound != null,
        availableQuantity: detail?.availableQuantity ?? 0,
        visits: itemVisits,
        dateCreated: detail?.dateCreated ?? null,
        catalogProductId: detail?.catalogProductId ?? null,
        userProductId: detail?.userProductId ?? null,
        permalink: detail?.permalink ?? null,
        thumbnail: detail?.thumbnail ?? null,
        intelligence,
        monitored: Boolean(watch),
        momentum: watch?.momentum ?? null,
        sources: {
          marketplace:
            "VISIBLE_MERCADO_LIVRE_PAGE",
          itemDetails: detail ? "ITEMS_BULK" : "UNAVAILABLE",
          soldQuantity:
            apiSoldQuantity != null
              ? "ITEMS_BULK"
              : visible.soldQuantityLowerBound != null
                ? "VISIBLE_RANGE_LOWER_BOUND"
                : "UNAVAILABLE",
          visits:
            itemVisits != null ? "VISITS_API" : "UNAVAILABLE",
        },
      };
    });

    const ownItems = items.filter(
      (item) => item.sellerId === session.account.mercadoLivreUserId,
    );

    if (ownItems.length > 0) {
      const marketItems = items.filter(
        (item) =>
          item.price > 0 &&
          item.sellerId !== session.account.mercadoLivreUserId,
      );
      const prices = marketItems
        .map((item) => item.price)
        .sort((a, b) => a - b);

      const minimum = round2(prices[0] ?? null);
      const p25 = round2(percentile(prices, 0.25));
      const median = round2(percentile(prices, 0.5));
      const p75 = round2(percentile(prices, 0.75));
      const maximum = round2(prices[prices.length - 1] ?? null);
      const average = round2(
        prices.length > 0
          ? prices.reduce((sum, price) => sum + price, 0) / prices.length
          : null,
      );

      await Promise.all(
        ownItems.map((ownItem) => {
          const gapToMedian =
            median != null && median > 0
              ? round2(((ownItem.price - median) / median) * 100)
              : null;

          return prisma.marketSnapshot.create({
            data: {
              sellerUserId: session.account.mercadoLivreUserId,
              mlItemId: ownItem.id,
              position: ownItem.searchPosition,
              query: parsed.data.query,
              categoryId: ownItem.categoryId,
              resultCount: marketItems.length,
              minimumPrice: minimum,
              p25Price: p25,
              medianPrice: median,
              p75Price: p75,
              maximumPrice: maximum,
              averagePrice: average,
              testedPrice: ownItem.price,
              marketGapPercent: gapToMedian,
              opportunityScore: ownItem.intelligence.score,
              verdict: null,
              competitors: marketItems.slice(0, 12).map((item) => ({
                id: item.id,
                title: item.title,
                price: item.price,
                searchPosition: item.searchPosition,
                sellerId: item.sellerId,
                freeShipping: item.freeShipping,
                logisticType: item.logisticType,
              })),
            },
          });
        }),
      );
    }

    return NextResponse.json({
      query: parsed.data.query,
      items,
      generatedAt: new Date().toISOString(),
      source: "VISIBLE_MERCADO_LIVRE_PAGE",
      note:
        "Os anúncios vieram da página que o usuário está vendo. O Radar enriqueceu os IDs com APIs oficiais disponíveis e registrou a posição dos seus anúncios quando eles apareceram.",
      rankingSnapshotsCaptured: ownItems.length,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao enriquecer a busca.";

    return NextResponse.json({ error: message, items: [] }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error:
        "Esta versão da extensão não faz mais busca ampla pelo backend. Atualize a extensão para usar os anúncios visíveis na página do Mercado Livre.",
      items: [],
    },
    { status: 410 },
  );
}

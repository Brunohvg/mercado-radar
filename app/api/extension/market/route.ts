import { NextResponse } from "next/server";
import { z } from "zod";
import { isExtensionAuthorized } from "@/lib/extension-auth";
import {
  getItemsBulk,
  getItemsVisitTotals,
  getMlSession,
  searchMarketplace,
} from "@/lib/mercado-livre";
import { calculateRadarOpportunityScore } from "@/lib/radar-score";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().trim().min(3).max(180),
  categoryId: z.string().trim().min(3).max(40).optional(),
  itemId: z.string().trim().regex(/^MLB\d+$/i).optional(),
  currentPrice: z.coerce.number().positive().optional(),
});

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "com", "sem", "para", "por", "em",
  "um", "uma", "un", "und", "unid", "unidade", "unidades", "kit", "pacote",
  "novo", "nova", "original", "cor",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function similarity(query: string, title: string) {
  const queryTokens = [...new Set(tokens(query))];
  const titleSet = new Set(tokens(title));

  if (!queryTokens.length) return 0;

  const matches = queryTokens.filter((token) => titleSet.has(token)).length;
  return matches / queryTokens.length;
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export async function GET(request: Request) {
  if (!isExtensionAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = schema.safeParse({
    title: url.searchParams.get("title") ?? "",
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    itemId: url.searchParams.get("itemId") ?? undefined,
    currentPrice: url.searchParams.get("currentPrice") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Contexto insuficiente para comparar mercado." },
      { status: 400 },
    );
  }

  try {
    const session = await getMlSession();
    const results = await searchMarketplace({
      accessToken: session.accessToken,
      query: parsed.data.title,
      categoryId: parsed.data.categoryId,
      limit: 50,
    });

    const ranked = results
      .filter(
        (item) =>
          item.price > 0 &&
          item.id !== parsed.data.itemId?.toUpperCase() &&
          item.sellerId !== session.account.mercadoLivreUserId,
      )
      .map((item) => ({
        ...item,
        similarity: similarity(parsed.data.title, item.title),
      }))
      .filter((item) => item.similarity >= 0.35)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20);

    const source = ranked.length >= 5
      ? ranked
      : results
          .filter(
            (item) =>
              item.price > 0 &&
              item.id !== parsed.data.itemId?.toUpperCase() &&
              item.sellerId !== session.account.mercadoLivreUserId,
          )
          .slice(0, 20)
          .map((item) => ({ ...item, similarity: similarity(parsed.data.title, item.title) }));

    const competitorIds = source.map((item) => item.id).slice(0, 20);
    const [details, visits] = await Promise.all([
      getItemsBulk({
        accessToken: session.accessToken,
        itemIds: competitorIds,
      }).catch(() => []),
      getItemsVisitTotals({
        accessToken: session.accessToken,
        itemIds: competitorIds,
      }).catch(() => ({} as Record<string, number>)),
    ]);

    const detailById = new Map(details.map((item) => [item.id, item]));

    const enrichedSource = source.map((item) => {
      const detail = detailById.get(item.id);
      const itemVisits = visits[item.id] ?? null;
      const intelligence = calculateRadarOpportunityScore({
        price: item.price,
        soldQuantity: detail?.soldQuantity ?? 0,
        visits: itemVisits,
        dateCreated: detail?.dateCreated ?? null,
        freeShipping: item.freeShipping || Boolean(detail?.freeShipping),
        listingTypeId: item.listingTypeId ?? detail?.listingTypeId ?? null,
      });

      return {
        ...item,
        detail,
        visits: itemVisits,
        intelligence,
      };
    });

    const prices = enrichedSource.map((item) => item.price).sort((a, b) => a - b);
    if (!prices.length) {
      return NextResponse.json({
        market: null,
        competitors: [],
      });
    }

    const minimum = round2(prices[0]);
    const p25 = round2(percentile(prices, 0.25));
    const median = round2(percentile(prices, 0.5));
    const p75 = round2(percentile(prices, 0.75));
    const maximum = round2(prices[prices.length - 1]);
    const average = round2(prices.reduce((sum, price) => sum + price, 0) / prices.length);

    const currentPrice = parsed.data.currentPrice ?? null;
    const gapToMedian =
      currentPrice && median > 0
        ? round2(((currentPrice - median) / median) * 100)
        : null;

    return NextResponse.json({
      market: {
        count: prices.length,
        minimum,
        p25,
        median,
        p75,
        maximum,
        average,
        currentPrice,
        gapToMedian,
      },
      competitors: enrichedSource
        .sort((a, b) => {
          const similarityGap = b.similarity - a.similarity;
          if (Math.abs(similarityGap) > 0.08) return similarityGap;
          return b.intelligence.score - a.intelligence.score;
        })
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          title: item.title,
          price: round2(item.price),
          freeShipping: item.freeShipping || Boolean(item.detail?.freeShipping),
          listingTypeId:
            item.listingTypeId ?? item.detail?.listingTypeId ?? null,
          permalink: item.permalink ?? item.detail?.permalink ?? null,
          similarityPercent: Math.round(item.similarity * 100),
          soldQuantity: item.detail?.soldQuantity ?? 0,
          visits: item.visits,
          dateCreated: item.detail?.dateCreated ?? null,
          ageDays: item.intelligence.ageDays,
          salesPerMonth: item.intelligence.salesPerMonth,
          revenuePerMonth: item.intelligence.revenuePerMonth,
          score: item.intelligence.score,
          demandLabel: item.intelligence.demandLabel,
          catalogProductId: item.detail?.catalogProductId ?? null,
          userProductId: item.detail?.userProductId ?? null,
        })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao comparar o mercado.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCategoryHighlights,
  getItemsBulk,
  getItemsCurrentPrices,
  getItemsVisitTotals,
  getMlSession,
  predictCategory,
  searchMarketplace,
} from "@/lib/mercado-livre";
import { calculateSearchOpportunityScore } from "@/lib/opportunity-intelligence";

export const dynamic = "force-dynamic";

const schema = z.object({
  query: z.string().trim().min(2).max(180),
  categoryId: z.string().trim().min(3).max(40).optional(),
  limit: z.coerce.number().int().min(8).max(40).default(24),
});

const STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "com",
  "sem",
  "para",
  "por",
  "em",
  "um",
  "uma",
  "kit",
  "pacote",
  "un",
  "und",
  "unid",
  "unidade",
  "unidades",
  "novo",
  "nova",
  "original",
  "cor",
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

function criticalTokens(value: string) {
  return tokens(value).filter((token) => /\d/.test(token));
}

function similarity(query: string, title: string) {
  const queryTokens = [...new Set(tokens(query))];
  const titleTokens = new Set(tokens(title));
  const queryCritical = [...new Set(criticalTokens(query))];
  const titleCritical = new Set(criticalTokens(title));

  if (!queryTokens.length) return 0;

  const matches = queryTokens.filter((token) => titleTokens.has(token)).length;
  const coverage = matches / queryTokens.length;

  const criticalCoverage =
    queryCritical.length === 0
      ? 1
      : queryCritical.filter((token) => titleCritical.has(token)).length /
        queryCritical.length;

  const missingCritical = queryCritical.some(
    (token) => !titleCritical.has(token),
  );

  const base = coverage * 0.76 + criticalCoverage * 0.24;
  return Math.max(0, Math.min(1, missingCritical ? base * 0.5 : base));
}

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

function competitionLevel(uniqueSellers: number) {
  if (uniqueSellers >= 16) return "ALTA";
  if (uniqueSellers >= 8) return "MEDIA";
  return "BAIXA";
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe um produto ou termo válido para pesquisar." },
      { status: 400 },
    );
  }

  try {
    const session = await getMlSession();
    const { query, limit } = parsed.data;

    let categoryId = parsed.data.categoryId ?? null;
    let categoryName: string | null = null;
    let categorySource: "USER" | "PREDICTED" | "OPEN" = categoryId
      ? "USER"
      : "OPEN";

    if (!categoryId) {
      const predicted = await predictCategory({
        accessToken: session.accessToken,
        title: query,
        limit: 3,
      }).catch(() => []);

      if (predicted[0]?.categoryId) {
        categoryId = predicted[0].categoryId;
        categoryName = predicted[0].categoryName;
        categorySource = "PREDICTED";
      }
    }

    let searchResults = await searchMarketplace({
      accessToken: session.accessToken,
      query,
      categoryId: categoryId ?? undefined,
      limit: 50,
    });

    if (searchResults.length < 8 && categoryId) {
      searchResults = await searchMarketplace({
        accessToken: session.accessToken,
        query,
        limit: 50,
      });
      categorySource = "OPEN";
    }

    const candidates = searchResults
      .map((item, index) => ({
        ...item,
        searchPosition: index + 1,
        similarity: similarity(query, item.title),
      }))
      .filter(
        (item) =>
          item.price > 0 &&
          item.sellerId !== session.account.mercadoLivreUserId,
      )
      .sort((a, b) => {
        const relevance = b.similarity - a.similarity;
        if (Math.abs(relevance) > 0.08) return relevance;
        return a.searchPosition - b.searchPosition;
      });

    const strong = candidates.filter((item) => item.similarity >= 0.42);
    const selected = (strong.length >= 8 ? strong : candidates)
      .slice(0, Math.min(40, Math.max(limit, 24)));

    if (!selected.length) {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        query,
        category: {
          id: categoryId,
          name: categoryName,
          source: categorySource,
        },
        summary: null,
        opportunities: [],
        message:
          "Nenhum anúncio comparável foi encontrado. Tente um termo mais específico.",
      });
    }

    const itemIds = selected.map((item) => item.id);
    const [details, exactPrices, visits, highlights] = await Promise.all([
      getItemsBulk({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => []),
      getItemsCurrentPrices({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => ({} as Record<string, number | null>)),
      getItemsVisitTotals({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => ({} as Record<string, number>)),
      categoryId
        ? getCategoryHighlights({
            accessToken: session.accessToken,
            categoryId,
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const detailById = new Map(details.map((item) => [item.id, item]));
    const highlightContent = highlights?.content ?? [];

    function bestSellerPosition(itemId: string) {
      const detail = detailById.get(itemId);
      const ids = [
        itemId,
        detail?.catalogProductId ?? null,
        detail?.userProductId ?? null,
      ].filter((value): value is string => Boolean(value));

      const matches = highlightContent.filter((entry) =>
        ids.includes(entry.id),
      );

      if (!matches.length) return null;
      return Math.min(...matches.map((entry) => entry.position));
    }

    const enriched = selected.map((item) => {
      const detail = detailById.get(item.id);
      const price =
        exactPrices[item.id] ??
        (detail?.currentPrice && detail.currentPrice > 0
          ? detail.currentPrice
          : item.price);

      return {
        ...item,
        price,
        detail,
        visits: visits[item.id] ?? null,
      };
    });

    const relevant = enriched.filter(
      (item) => item.price > 0 && item.similarity >= 0.28,
    );

    const prices = relevant
      .map((item) => item.price)
      .filter((price) => price > 0)
      .sort((a, b) => a - b);

    const minimum = round2(prices[0] ?? null);
    const p25 = round2(percentile(prices, 0.25));
    const median = round2(percentile(prices, 0.5));
    const p75 = round2(percentile(prices, 0.75));
    const maximum = round2(prices[prices.length - 1] ?? null);
    const average = round2(
      prices.length
        ? prices.reduce((sum, price) => sum + price, 0) / prices.length
        : null,
    );

    const uniqueSellers = new Set(
      relevant.map((item) => item.sellerId).filter(Boolean),
    ).size;

    const opportunities = relevant
      .map((item) => {
        const detail = item.detail;
        const intelligence = calculateSearchOpportunityScore({
          price: item.price,
          medianPrice: median,
          searchPosition: item.searchPosition,
          soldQuantity: detail?.soldQuantity ?? 0,
          visits: item.visits,
          dateCreated: detail?.dateCreated ?? null,
          freeShipping: item.freeShipping || Boolean(detail?.freeShipping),
          logisticType: detail?.logisticType ?? null,
          catalogProductId: detail?.catalogProductId ?? null,
          listingTypeId:
            detail?.listingTypeId ?? item.listingTypeId ?? null,
          similarity: item.similarity,
        });

        const gapToMedian =
          median != null && median > 0
            ? round2(((item.price - median) / median) * 100)
            : null;

        return {
          id: item.id,
          title: item.title,
          price: round2(item.price),
          thumbnail: item.thumbnail ?? detail?.thumbnail ?? null,
          permalink: item.permalink ?? detail?.permalink ?? null,
          categoryId: item.categoryId ?? detail?.categoryId ?? null,
          sellerId: item.sellerId ?? detail?.sellerId ?? null,
          listingTypeId:
            detail?.listingTypeId ?? item.listingTypeId ?? null,
          freeShipping:
            item.freeShipping || Boolean(detail?.freeShipping),
          logisticType: detail?.logisticType ?? null,
          shippingMode: detail?.shippingMode ?? null,
          catalogProductId: detail?.catalogProductId ?? null,
          userProductId: detail?.userProductId ?? null,
          searchPosition: item.searchPosition,
          similarityPercent: Math.round(item.similarity * 100),
          soldQuantity: detail?.soldQuantity ?? 0,
          visits: item.visits,
          dateCreated: detail?.dateCreated ?? null,
          gapToMedian,
          score: intelligence.total,
          demandLabel: intelligence.demandLabel,
          evidence: intelligence.evidence,
          salesPerDay: intelligence.salesPerDay,
          salesPerMonth: intelligence.salesPerMonth,
          visitsPerDay: intelligence.visitsPerDay,
          revenuePerDay: intelligence.revenuePerDay,
          revenuePerMonth: intelligence.revenuePerMonth,
          ageDays: intelligence.ageDays,
          scoreComponents: intelligence.components,
          bestSellerPosition: bestSellerPosition(item.id),
          sources: {
            price:
              exactPrices[item.id] != null
                ? "PRICES_API"
                : detail?.currentPrice
                  ? "ITEM_DETAIL"
                  : "SEARCH",
            soldQuantity: detail ? "ITEM_DETAIL" : "UNAVAILABLE",
            visits: item.visits != null ? "VISITS_API" : "UNAVAILABLE",
          },
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const reliableOpportunities = opportunities.filter(
      (item) => item.evidence !== "LOW",
    );

    const knownMonthlySales = reliableOpportunities
      .map((item) => item.salesPerMonth)
      .filter((value): value is number => value != null);

    const knownRevenue = reliableOpportunities
      .map((item) => item.revenuePerMonth)
      .filter((value): value is number => value != null);

    const highEvidenceCount = opportunities.filter(
      (item) => item.evidence === "HIGH",
    ).length;

    const exactPriceCount = opportunities.filter(
      (item) => item.sources.price === "PRICES_API",
    ).length;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      query,
      category: {
        id: categoryId,
        name: categoryName,
        source: categorySource,
      },
      summary: {
        comparableCount: relevant.length,
        uniqueSellers,
        competitionLevel: competitionLevel(uniqueSellers),
        minimum,
        p25,
        median,
        p75,
        maximum,
        average,
        freeShippingPercent:
          relevant.length > 0
            ? Math.round(
                (relevant.filter(
                  (item) =>
                    item.freeShipping ||
                    Boolean(item.detail?.freeShipping),
                ).length /
                  relevant.length) *
                  100,
              )
            : 0,
        fullPercent:
          relevant.length > 0
            ? Math.round(
                (relevant.filter(
                  (item) => item.detail?.logisticType === "fulfillment",
                ).length /
                  relevant.length) *
                  100,
              )
            : 0,
        flexPercent:
          relevant.length > 0
            ? Math.round(
                (relevant.filter(
                  (item) => item.detail?.logisticType === "self_service",
                ).length /
                  relevant.length) *
                  100,
              )
            : 0,
        catalogPercent:
          relevant.length > 0
            ? Math.round(
                (relevant.filter(
                  (item) => item.detail?.catalogProductId,
                ).length /
                  relevant.length) *
                  100,
              )
            : 0,
        highEvidenceCount,
        exactPricePercent:
          opportunities.length > 0
            ? Math.round((exactPriceCount / opportunities.length) * 100)
            : 0,
        medianEstimatedSalesPerMonth: round2(
          percentile(
            [...knownMonthlySales].sort((a, b) => a - b),
            0.5,
          ),
        ),
        medianEstimatedRevenuePerMonth: round2(
          percentile(
            [...knownRevenue].sort((a, b) => a - b),
            0.5,
          ),
        ),
      },
      opportunities,
      methodology: {
        exact:
          "Preço atual, vendidos acumulados, visitas, tipo de anúncio, frete grátis, catálogo e posição retornada pela busca.",
        estimated:
          "Vendas/mês e faturamento/mês são estimados pela razão entre vendidos acumulados e idade do anúncio.",
        score:
          "Score combina demanda, velocidade, relevância da busca, posição de preço, logística e qualidade da evidência.",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao pesquisar oportunidades.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

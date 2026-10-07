import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCatalogProductDetails,
  getCatalogProductOffers,
  getCategoryHighlights,
  getItemsBulk,
  getItemsVisitTotals,
  getMlSession,
  predictCategory,
  searchCatalogProducts,
} from "@/lib/mercado-livre";
import { calculateSearchOpportunityScore } from "@/lib/opportunity-intelligence";

export const dynamic = "force-dynamic";

const schema = z.object({
  query: z.string().trim().min(2).max(180),
  categoryId: z.string().trim().min(3).max(40).optional(),
  limit: z.coerce.number().int().min(8).max(24).default(16),
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
  if (uniqueSellers >= 12) return "ALTA";
  if (uniqueSellers >= 6) return "MEDIA";
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
    let categorySource: "USER" | "PREDICTED" | "CATALOG" = categoryId
      ? "USER"
      : "CATALOG";

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

    const catalog = await searchCatalogProducts({
      accessToken: session.accessToken,
      query,
      limit: Math.min(20, Math.max(limit, 12)),
    });

    const rankedCatalog = catalog
      .map((product, index) => ({
        ...product,
        catalogPosition: index + 1,
        similarity: similarity(query, product.name),
      }))
      .filter((product) => product.similarity >= 0.28)
      .sort((a, b) => {
        const relevance = b.similarity - a.similarity;
        if (Math.abs(relevance) > 0.08) return relevance;
        return a.catalogPosition - b.catalogPosition;
      })
      .slice(0, Math.min(16, limit));

    if (!rankedCatalog.length) {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        query,
        source: "CATALOG_SEARCH",
        category: {
          id: categoryId,
          name: categoryName,
          source: categorySource,
        },
        summary: null,
        opportunities: [],
        message:
          "O buscador oficial de produtos não encontrou comparáveis de catálogo. Para anúncios tradicionais e todos os resultados do marketplace, use a Extensão Radar diretamente na busca do Mercado Livre.",
      });
    }

    const productDetails = await Promise.all(
      rankedCatalog.map(async (product) => {
        const detail = await getCatalogProductDetails({
          accessToken: session.accessToken,
          productId: product.id,
        }).catch(() => null);

        // Plano B documentado: sem buy_box_winner, usa a oferta mais barata
        // listada em GET /products/{id}/items.
        let fallback: Awaited<ReturnType<typeof getCatalogProductOffers>>[number] | null =
          null;
        if (!/^MLB\d+$/i.test(String(detail?.buy_box_winner?.item_id ?? ""))) {
          const offers = await getCatalogProductOffers({
            accessToken: session.accessToken,
            productId: product.id,
            limit: 20,
          }).catch(() => []);
          fallback = [...offers].sort((a, b) => a.price - b.price)[0] ?? null;
        }

        return { product, detail, fallback };
      }),
    );

    const winnerCandidates = productDetails
      .map(({ product, detail, fallback }) => {
        const winner = detail?.buy_box_winner;
        const winnerId = winner?.item_id
          ? String(winner.item_id).toUpperCase()
          : null;
        const itemId =
          winnerId && /^MLB\d+$/i.test(winnerId)
            ? winnerId
            : (fallback?.itemId ?? null);

        if (!itemId || !/^MLB\d+$/i.test(itemId)) return null;
        const usingFallback = itemId !== winnerId;

        return {
          product,
          detail,
          itemId,
          title: detail?.name ?? product.name,
          price: Number(usingFallback ? fallback?.price : winner?.price) || 0,
          sellerId:
            (usingFallback ? fallback?.sellerId : winner?.seller_id) == null
              ? null
              : String(usingFallback ? fallback?.sellerId : winner?.seller_id),
          categoryId: winner?.category_id ?? categoryId,
          soldQuantity: Number(
            winner?.sold_quantity ?? detail?.sold_quantity ?? 0,
          ),
          freeShipping: usingFallback
            ? Boolean(fallback?.freeShipping)
            : Boolean(winner?.shipping?.free_shipping),
          logisticType: usingFallback
            ? (fallback?.logisticType ?? null)
            : (winner?.shipping?.logistic_type ?? null),
        };
      })
      .filter(
        (
          candidate,
        ): candidate is NonNullable<typeof candidate> =>
          Boolean(candidate),
      );

    if (!winnerCandidates.length) {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        query,
        source: "CATALOG_SEARCH",
        category: {
          id: categoryId,
          name: categoryName,
          source: categorySource,
        },
        summary: null,
        opportunities: [],
        message:
          "Encontramos produtos de catálogo, mas o Mercado Livre não liberou ofertas utilizáveis para o seu aplicativo nesta busca (nem o vencedor nem a lista de ofertas). Abra a busca no Mercado Livre com a Extensão Radar para analisar os anúncios visíveis.",
      });
    }

    const itemIds = [...new Set(winnerCandidates.map((item) => item.itemId))];
    const [details, visits] = await Promise.all([
      getItemsBulk({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => []),
      getItemsVisitTotals({
        accessToken: session.accessToken,
        itemIds,
      }).catch(() => ({} as Record<string, number>)),
    ]);

    const detailById = new Map(details.map((item) => [item.id, item]));

    const candidates = winnerCandidates
      .map((candidate, index) => {
        const item = detailById.get(candidate.itemId);
        const price =
          candidate.price > 0
            ? candidate.price
            : item?.currentPrice ?? 0;

        return {
          ...candidate,
          item,
          price,
          searchPosition: candidate.product.catalogPosition || index + 1,
          visits: visits[candidate.itemId] ?? null,
          similarity: candidate.product.similarity,
        };
      })
      .filter((candidate) => candidate.price > 0);

    const prices = candidates
      .map((item) => item.price)
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
      candidates.map((item) => item.sellerId).filter(Boolean),
    ).size;

    const effectiveCategoryId =
      categoryId ??
      candidates.find((item) => item.categoryId)?.categoryId ??
      null;

    const highlights = effectiveCategoryId
      ? await getCategoryHighlights({
          accessToken: session.accessToken,
          categoryId: effectiveCategoryId,
        }).catch(() => null)
      : null;

    const highlightContent = highlights?.content ?? [];

    function bestSellerPosition(candidate: (typeof candidates)[number]) {
      const ids = [
        candidate.itemId,
        candidate.product.id,
        candidate.item?.userProductId ?? null,
      ].filter((value): value is string => Boolean(value));

      const matches = highlightContent.filter((entry) =>
        ids.includes(entry.id),
      );

      if (!matches.length) return null;
      return Math.min(...matches.map((entry) => entry.position));
    }

    const opportunities = candidates
      .map((candidate) => {
        const item = candidate.item;
        const intelligence = calculateSearchOpportunityScore({
          price: candidate.price,
          medianPrice: median,
          searchPosition: candidate.searchPosition,
          soldQuantity:
            item?.soldQuantity && item.soldQuantity > 0
              ? item.soldQuantity
              : candidate.soldQuantity,
          visits: candidate.visits,
          dateCreated: item?.dateCreated ?? null,
          freeShipping:
            candidate.freeShipping || Boolean(item?.freeShipping),
          logisticType:
            item?.logisticType ?? candidate.logisticType,
          catalogProductId: candidate.product.id,
          listingTypeId: item?.listingTypeId ?? null,
          similarity: candidate.similarity,
        });

        const gapToMedian =
          median != null && median > 0
            ? round2(((candidate.price - median) / median) * 100)
            : null;

        return {
          id: candidate.itemId,
          title: candidate.title,
          price: round2(candidate.price),
          thumbnail: item?.thumbnail ?? null,
          permalink:
            item?.permalink ?? candidate.detail?.permalink ?? null,
          categoryId: candidate.categoryId ?? item?.categoryId ?? null,
          sellerId: candidate.sellerId ?? item?.sellerId ?? null,
          listingTypeId: item?.listingTypeId ?? null,
          freeShipping:
            candidate.freeShipping || Boolean(item?.freeShipping),
          logisticType:
            item?.logisticType ?? candidate.logisticType,
          shippingMode: item?.shippingMode ?? null,
          catalogProductId: candidate.product.id,
          userProductId: item?.userProductId ?? null,
          searchPosition: candidate.searchPosition,
          similarityPercent: Math.round(candidate.similarity * 100),
          soldQuantity:
            item?.soldQuantity && item.soldQuantity > 0
              ? item.soldQuantity
              : candidate.soldQuantity,
          visits: candidate.visits,
          dateCreated: item?.dateCreated ?? null,
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
          bestSellerPosition: bestSellerPosition(candidate),
          sources: {
            discovery: "PRODUCTS_SEARCH",
            price: "CATALOG_BUY_BOX_WINNER",
            soldQuantity:
              candidate.soldQuantity > 0
                ? "CATALOG_PRODUCT"
                : item?.soldQuantity
                  ? "ITEMS_BULK"
                  : "UNAVAILABLE",
            visits:
              candidate.visits != null ? "VISITS_API" : "UNAVAILABLE",
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

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      query,
      source: "CATALOG_SEARCH",
      category: {
        id: effectiveCategoryId,
        name: categoryName,
        source: categorySource,
      },
      summary: {
        comparableCount: opportunities.length,
        uniqueSellers,
        competitionLevel: competitionLevel(uniqueSellers),
        minimum,
        p25,
        median,
        p75,
        maximum,
        average,
        freeShippingPercent:
          opportunities.length > 0
            ? Math.round(
                (opportunities.filter((item) => item.freeShipping).length /
                  opportunities.length) *
                  100,
              )
            : 0,
        fullPercent:
          opportunities.length > 0
            ? Math.round(
                (opportunities.filter(
                  (item) => item.logisticType === "fulfillment",
                ).length /
                  opportunities.length) *
                  100,
              )
            : 0,
        flexPercent:
          opportunities.length > 0
            ? Math.round(
                (opportunities.filter(
                  (item) => item.logisticType === "self_service",
                ).length /
                  opportunities.length) *
                  100,
              )
            : 0,
        catalogPercent: 100,
        highEvidenceCount,
        exactPricePercent: 100,
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
          "A descoberta usa o buscador oficial de produtos do Mercado Livre. Preço e seller vêm do buy_box_winner; sem ele, da oferta mais barata em /products/{id}/items. Detalhes adicionais usam o multiget /items?ids=.",
        estimated:
          "Vendas/mês e faturamento/mês continuam sendo estimativas baseadas nos sinais disponíveis e são identificadas como estimativas na interface.",
        score:
          "Score combina demanda, velocidade, relevância do produto, posição de preço, logística e qualidade da evidência.",
      },
      extensionRecommended: true,
      extensionMessage:
        "A extensão complementa esta visão com todos os anúncios que aparecem na página de resultados, inclusive publicações tradicionais fora do catálogo.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao pesquisar oportunidades.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

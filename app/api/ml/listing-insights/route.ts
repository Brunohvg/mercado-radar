import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getExistingItemShippingQuote,
  getListingPriceQuote,
  getMlSession,
  searchMarketplace,
} from "@/lib/mercado-livre";
import { analyzeProfitability } from "@/lib/profitability";
import { buildCompetitivePriceStrategy } from "@/lib/price-strategy";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().trim().regex(/^MLB\d+$/i),
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

function similarity(left: string, right: string) {
  const leftTokens = [...new Set(tokens(left))];
  const rightSet = new Set(tokens(right));

  if (!leftTokens.length || !rightSet.size) return 0;

  const matches = leftTokens.filter((token) => rightSet.has(token)).length;
  return matches / leftTokens.length;
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

const round2 = (value: number | null) =>
  value == null
    ? null
    : Math.round((value + Number.EPSILON) * 100) / 100;

function listingTypeFromId(value: string | null) {
  return value === "gold_pro" ? ("PREMIUM" as const) : ("CLASSIC" as const);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = schema.safeParse({ id: url.searchParams.get("id") ?? "" });

  if (!parsed.success) {
    return NextResponse.json({ error: "Anúncio inválido." }, { status: 400 });
  }

  try {
    const session = await getMlSession();
    const sellerUserId = session.account.mercadoLivreUserId;
    const itemId = parsed.data.id.toUpperCase();

    const product = await prisma.mercadoLivreProduct.findFirst({
      where: {
        sellerUserId,
        mlItemId: itemId,
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Esse anúncio não pertence à conta conectada." },
        { status: 404 },
      );
    }

    const currentPrice =
      product.currentPrice == null ? null : Number(product.currentPrice);

    const results = await searchMarketplace({
      accessToken: session.accessToken,
      query: product.title,
      categoryId: product.categoryId ?? undefined,
      limit: 50,
    });

    const positionIndex = results.findIndex((item) => item.id === itemId);
    const position = positionIndex >= 0 ? positionIndex + 1 : null;

    const ranked = results
      .filter(
        (item) =>
          item.price > 0 &&
          item.id !== itemId &&
          item.sellerId !== sellerUserId,
      )
      .map((item) => ({
        ...item,
        similarity: similarity(product.title, item.title),
      }))
      .filter((item) => item.similarity >= 0.35)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20);

    const source =
      ranked.length >= 5
        ? ranked
        : results
            .filter(
              (item) =>
                item.price > 0 &&
                item.id !== itemId &&
                item.sellerId !== sellerUserId,
            )
            .slice(0, 20)
            .map((item) => ({
              ...item,
              similarity: similarity(product.title, item.title),
            }));

    const prices = source
      .map((item) => item.price)
      .filter((price) => price > 0)
      .sort((a, b) => a - b);

    const p25 = round2(percentile(prices, 0.25));
    const median = round2(percentile(prices, 0.5));
    const p75 = round2(percentile(prices, 0.75));
    const minimum = prices.length ? round2(prices[0]) : null;
    const maximum = prices.length
      ? round2(prices[prices.length - 1])
      : null;
    const average =
      prices.length > 0
        ? round2(
            prices.reduce((sum, price) => sum + price, 0) / prices.length,
          )
        : null;

    let unitCost =
      product.supplierPrice == null
        ? null
        : Number(product.supplierPrice) *
          (1 - Number(product.discountPercent) / 100);

    if (unitCost == null && product.sku) {
      const local = await prisma.product.findUnique({
        where: { sku: product.sku },
        select: {
          supplierPrice: true,
          discountPercent: true,
        },
      });

      if (local) {
        unitCost =
          Number(local.supplierPrice) *
          (1 - Number(local.discountPercent) / 100);
      }
    }

    let profitability = null;
    let strategy = null;

    if (
      unitCost != null &&
      currentPrice != null &&
      currentPrice > 0 &&
      product.categoryId
    ) {
      const listingType = listingTypeFromId(product.listingTypeId);
      const settings = await prisma.appSettings.findUnique({
        where: { id: "default" },
      });

      const targetMarginPercent = Number(
        settings?.targetMarginPercent ?? 20,
      );
      const targetRoiPercent = Number(settings?.targetRoiPercent ?? 30);
      const operatingCost = Number(
        settings?.operatingCostDefault ?? 1,
      );

      const [fee, shipping] = await Promise.all([
        getListingPriceQuote({
          accessToken: session.accessToken,
          price: currentPrice,
          categoryId: product.categoryId,
          listingType,
        }),
        getExistingItemShippingQuote({
          accessToken: session.accessToken,
          userId: sellerUserId,
          itemId,
          price: currentPrice,
          listingType,
          freeShipping: product.freeShipping,
        }).catch(() => ({
          shippingCost: 0,
          billableWeight: 0,
          discountRate: 0,
          promotedAmount: 0,
          raw: null,
        })),
      ]);

      profitability = analyzeProfitability({
        productName: product.title,
        supplierPrice: unitCost,
        discountPercent: 0,
        kitQuantity: 1,
        salePrice: currentPrice,
        listingType,
        commissionPercent: fee.commissionPercent,
        fixedFee: fee.fixedFee,
        shippingCost: shipping.shippingCost,
        operatingCost,
        taxPercent: 0,
        targetMarginPercent,
        targetRoiPercent,
      });

      if (p25 != null && p25 > 0) {
        strategy = buildCompetitivePriceStrategy({
          currentPrice,
          marketReferencePrice: p25,
          minimumSuggestedPrice: profitability.minimumSuggestedPrice,
          breakEvenPrice: profitability.breakEvenPrice,
        });
      }
    }

    const gapToMedian =
      currentPrice != null && median != null && median > 0
        ? round2(((currentPrice - median) / median) * 100)
        : null;

    const compactCompetitors = source
      .sort((a, b) => a.price - b.price)
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        title: item.title,
        price: round2(item.price),
        freeShipping: item.freeShipping,
        listingTypeId: item.listingTypeId,
        similarityPercent: Math.round(item.similarity * 100),
      }));

    await prisma.marketSnapshot.create({
      data: {
        sellerUserId,
        mlItemId: itemId,
        position,
        query: product.title,
        categoryId: product.categoryId,
        resultCount: prices.length,
        minimumPrice: minimum,
        p25Price: p25,
        medianPrice: median,
        p75Price: p75,
        maximumPrice: maximum,
        averagePrice: average,
        testedPrice: currentPrice,
        marketGapPercent: gapToMedian,
        opportunityScore: null,
        verdict: strategy?.action ?? null,
        competitors: compactCompetitors,
      },
    });

    const history = await prisma.marketSnapshot.findMany({
      where: {
        sellerUserId,
        mlItemId: itemId,
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        position: true,
        testedPrice: true,
        medianPrice: true,
        p25Price: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      item: {
        mlItemId: product.mlItemId,
        title: product.title,
        currentPrice,
        status: product.status,
        listingTypeId: product.listingTypeId,
        channel: product.catalogProductId ? "CATALOG" : "TRADITIONAL",
      },
      ranking: {
        position,
        searched: results.length,
        note:
          position == null
            ? "Seu anúncio não apareceu entre os primeiros resultados retornados para esta consulta."
            : null,
      },
      market: {
        count: prices.length,
        minimum,
        p25,
        median,
        p75,
        maximum,
        average,
        gapToMedian,
      },
      profitability,
      strategy,
      competitors: compactCompetitors,
      history: history.map((snapshot) => ({
        position: snapshot.position,
        testedPrice:
          snapshot.testedPrice == null
            ? null
            : Number(snapshot.testedPrice),
        medianPrice:
          snapshot.medianPrice == null
            ? null
            : Number(snapshot.medianPrice),
        p25Price:
          snapshot.p25Price == null
            ? null
            : Number(snapshot.p25Price),
        createdAt: snapshot.createdAt,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao analisar posicionamento do anúncio.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

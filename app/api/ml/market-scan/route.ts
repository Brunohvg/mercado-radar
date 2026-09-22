import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getItemCurrentPrice,
  getListingPriceQuote,
  getMlSession,
  getShippingQuote,
  searchMarketplace,
} from "@/lib/mercado-livre";
import { analyzeProfitability } from "@/lib/profitability";

const schema = z.object({
  productName: z.string().trim().min(3).max(180),
  supplierPrice: z.coerce.number().positive(),
  discountPercent: z.coerce.number().min(0).max(95).default(0),
  kitQuantity: z.coerce.number().int().min(1).max(1000).default(1),
  salePrice: z.coerce.number().positive(),
  listingType: z.enum(["CLASSIC", "PREMIUM"]),
  categoryId: z.string().trim().min(3).max(40),
  weightGrams: z.coerce.number().int().positive().max(100000),
  heightCm: z.coerce.number().positive().max(300),
  widthCm: z.coerce.number().positive().max(300),
  lengthCm: z.coerce.number().positive().max(300),
  operatingCost: z.coerce.number().min(0).default(0),
  targetMarginPercent: z.coerce.number().min(0).max(80).default(20),
  targetRoiPercent: z.coerce.number().min(0).max(500).default(30),
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

function numericTokens(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => /^\d+(?:\d+)?$/.test(token));
}

function similarity(query: string, title: string) {
  const queryTokens = [...new Set(tokens(query))];
  const titleSet = new Set(tokens(title));
  const queryNumbers = [...new Set(numericTokens(query))];
  const titleNumbers = new Set(numericTokens(title));

  if (queryTokens.length === 0) return 0;

  const wordMatches = queryTokens.filter((token) => titleSet.has(token)).length;
  const wordScore = wordMatches / queryTokens.length;

  const numberScore =
    queryNumbers.length === 0
      ? 1
      : queryNumbers.filter((token) => titleNumbers.has(token)).length /
        queryNumbers.length;

  return Math.round((wordScore * 0.72 + numberScore * 0.28) * 1000) / 1000;
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

function ratioScore(value: number, target: number) {
  if (target <= 0) return 1;
  return Math.max(0, Math.min(1, value / target));
}

function verdictLabel(code: string) {
  const labels: Record<string, string> = {
    GOOD_FIT: "Boa aderência ao mercado",
    TEST_SMALL: "Testar com estoque pequeno",
    PRICE_OUTSIDE_MARKET: "Preço necessário acima do mercado",
    FINANCE_WEAK: "Margem insuficiente",
    LOW_EVIDENCE: "Poucos comparáveis",
  };
  return labels[code] ?? code;
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados insuficientes para analisar o mercado." },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const session = await getMlSession();

    const searchResults = await searchMarketplace({
      accessToken: session.accessToken,
      query: input.productName,
      categoryId: input.categoryId,
      limit: 35,
    });

    const ranked = searchResults
      .filter(
        (item) =>
          item.sellerId !== session.account.mercadoLivreUserId &&
          item.price > 0,
      )
      .map((item) => ({
        ...item,
        similarity: similarity(input.productName, item.title),
      }))
      .sort((a, b) => b.similarity - a.similarity);

    const reasonablySimilar = ranked.filter((item) => item.similarity >= 0.38);
    const selected = (reasonablySimilar.length >= 5 ? reasonablySimilar : ranked)
      .slice(0, 12);

    const enriched = await Promise.all(
      selected.map(async (item) => {
        try {
          const currentPrice = await getItemCurrentPrice({
            accessToken: session.accessToken,
            itemId: item.id,
          });

          return {
            ...item,
            price: currentPrice && currentPrice > 0 ? currentPrice : item.price,
            priceSource: currentPrice ? "prices_api" : "search",
          };
        } catch {
          return { ...item, priceSource: "search" };
        }
      }),
    );

    const comparable = enriched
      .filter((item) => item.price > 0)
      .sort((a, b) => b.similarity - a.similarity);

    if (comparable.length === 0) {
      return NextResponse.json(
        {
          error:
            "Não encontrei anúncios comparáveis suficientes para esse produto.",
        },
        { status: 422 },
      );
    }

    const prices = comparable.map((item) => item.price).sort((a, b) => a - b);
    const minimumPrice = round2(prices[0]);
    const p25Price = round2(percentile(prices, 0.25));
    const medianPrice = round2(percentile(prices, 0.5));
    const p75Price = round2(percentile(prices, 0.75));
    const maximumPrice = round2(prices[prices.length - 1]);
    const averagePrice = round2(
      prices.reduce((sum, price) => sum + price, 0) / prices.length,
    );

    const [currentFee, currentShipping, medianFee, medianShipping] =
      await Promise.all([
        getListingPriceQuote({
          accessToken: session.accessToken,
          price: input.salePrice,
          categoryId: input.categoryId,
          listingType: input.listingType,
        }),
        getShippingQuote({
          accessToken: session.accessToken,
          userId: session.account.mercadoLivreUserId,
          price: input.salePrice,
          listingType: input.listingType,
          weightGrams: input.weightGrams,
          heightCm: input.heightCm,
          widthCm: input.widthCm,
          lengthCm: input.lengthCm,
        }),
        getListingPriceQuote({
          accessToken: session.accessToken,
          price: medianPrice,
          categoryId: input.categoryId,
          listingType: input.listingType,
        }),
        getShippingQuote({
          accessToken: session.accessToken,
          userId: session.account.mercadoLivreUserId,
          price: medianPrice,
          listingType: input.listingType,
          weightGrams: input.weightGrams,
          heightCm: input.heightCm,
          widthCm: input.widthCm,
          lengthCm: input.lengthCm,
        }),
      ]);

    const analysis = analyzeProfitability({
      productName: input.productName,
      supplierPrice: input.supplierPrice,
      discountPercent: input.discountPercent,
      kitQuantity: input.kitQuantity,
      salePrice: input.salePrice,
      listingType: input.listingType,
      commissionPercent: currentFee.commissionPercent,
      fixedFee: currentFee.fixedFee,
      shippingCost: currentShipping.shippingCost,
      operatingCost: input.operatingCost,
      targetMarginPercent: input.targetMarginPercent,
      targetRoiPercent: input.targetRoiPercent,
    });

    const marketGapPercent =
      medianPrice > 0
        ? round2(((input.salePrice - medianPrice) / medianPrice) * 100)
        : 0;

    const netBeforeProductAtMedian =
      medianPrice - medianFee.saleFeeAmount - medianShipping.shippingCost;

    const marginLimit =
      netBeforeProductAtMedian -
      input.operatingCost -
      medianPrice * (input.targetMarginPercent / 100);

    const roi = input.targetRoiPercent / 100;
    const roiLimit =
      netBeforeProductAtMedian / (1 + roi) - input.operatingCost;

    const maxPurchaseCostAtMedian = Math.max(
      0,
      Math.min(marginLimit, roiLimit),
    );
    const maxNetUnitCostAtMedian =
      maxPurchaseCostAtMedian / Math.max(1, input.kitQuantity);

    const discountFactor = 1 - input.discountPercent / 100;
    const maxSupplierPriceAtMedian =
      discountFactor > 0 ? maxNetUnitCostAtMedian / discountFactor : 0;

    const currentNetUnitCost =
      input.supplierPrice * (1 - input.discountPercent / 100);
    const costReductionNeeded = Math.max(
      0,
      currentNetUnitCost - maxNetUnitCostAtMedian,
    );

    const financeScore =
      ((ratioScore(analysis.marginPercent, input.targetMarginPercent) +
        ratioScore(analysis.roiPercent, input.targetRoiPercent)) /
        2) *
      100;

    const positiveGap = Math.max(0, marketGapPercent / 100);
    const marketScore = Math.max(0, Math.min(100, 100 - positiveGap * 250));
    const averageSimilarity =
      comparable.reduce((sum, item) => sum + item.similarity, 0) /
      comparable.length;
    const evidenceScore = Math.min(
      100,
      comparable.length * 8 * Math.max(0.55, averageSimilarity),
    );

    const fitScore = Math.round(
      financeScore * 0.5 + marketScore * 0.4 + evidenceScore * 0.1,
    );

    const financeHealthy =
      analysis.profit > 0 &&
      analysis.marginPercent >= input.targetMarginPercent &&
      analysis.roiPercent >= input.targetRoiPercent;

    let verdict = "FINANCE_WEAK";
    if (comparable.length < 4) {
      verdict = "LOW_EVIDENCE";
    } else if (financeHealthy && input.salePrice <= p75Price) {
      verdict = "GOOD_FIT";
    } else if (
      analysis.profit > 0 &&
      analysis.marginPercent >= 15 &&
      input.salePrice <= p75Price * 1.1
    ) {
      verdict = "TEST_SMALL";
    } else if (input.salePrice > p75Price * 1.1) {
      verdict = "PRICE_OUTSIDE_MARKET";
    }

    const competitors = comparable.slice(0, 8).map((item) => ({
      id: item.id,
      title: item.title,
      price: round2(item.price),
      similarity: Math.round(item.similarity * 100),
      permalink: item.permalink,
      freeShipping: item.freeShipping,
      listingTypeId: item.listingTypeId,
      priceSource: item.priceSource,
    }));

    await prisma.marketSnapshot.create({
      data: {
        sellerUserId: session.account.mercadoLivreUserId,
        query: input.productName,
        categoryId: input.categoryId,
        resultCount: comparable.length,
        minimumPrice,
        p25Price,
        medianPrice,
        p75Price,
        maximumPrice,
        averagePrice,
        testedPrice: input.salePrice,
        marketGapPercent,
        opportunityScore: fitScore,
        verdict,
        competitors,
      },
    });

    return NextResponse.json({
      verdict,
      verdictLabel: verdictLabel(verdict),
      fitScore,
      market: {
        resultCount: comparable.length,
        minimumPrice,
        p25Price,
        medianPrice,
        p75Price,
        maximumPrice,
        averagePrice,
        marketGapPercent,
      },
      finance: {
        profit: analysis.profit,
        marginPercent: analysis.marginPercent,
        roiPercent: analysis.roiPercent,
        minimumSuggestedPrice: analysis.minimumSuggestedPrice,
      },
      buyingPower: {
        currentNetUnitCost: round2(currentNetUnitCost),
        maxNetUnitCostAtMedian: round2(maxNetUnitCostAtMedian),
        maxSupplierPriceAtMedian: round2(maxSupplierPriceAtMedian),
        costReductionNeeded: round2(costReductionNeeded),
      },
      evidence: {
        averageSimilarityPercent: Math.round(averageSimilarity * 100),
        comparableCount: comparable.length,
      },
      competitors,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao analisar concorrência no Mercado Livre.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

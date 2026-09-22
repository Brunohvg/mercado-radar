import { NextResponse } from "next/server";
import {
  getCatalogProductDetails,
  getCategoryHighlights,
  getItemCurrentPrice,
  getItemFullDetails,
  getListingPriceQuote,
  getMlSession,
  getShippingQuote,
  getTrends,
  predictCategory,
  searchCatalogProducts,
  searchMarketplace,
} from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

const PACKAGE_IDS = {
  height: "SELLER_PACKAGE_HEIGHT",
  width: "SELLER_PACKAGE_WIDTH",
  length: "SELLER_PACKAGE_LENGTH",
  weight: "SELLER_PACKAGE_WEIGHT",
} as const;

function attributeNumber(
  attributes:
    | Array<{
        id?: string;
        value_name?: string;
        value_struct?: { number?: number; unit?: string } | null;
        values?: Array<{
          name?: string;
          struct?: { number?: number; unit?: string } | null;
        }>;
      }>
    | undefined,
  id: string,
) {
  const attribute = attributes?.find((item) => item.id === id);
  if (!attribute) return null;

  const structured =
    attribute.value_struct?.number ??
    attribute.values?.find((value) => value.struct?.number)?.struct?.number;

  if (typeof structured === "number" && Number.isFinite(structured)) {
    return structured;
  }

  const raw =
    attribute.value_name ??
    attribute.values?.find((value) => value.name)?.name ??
    "";
  const match = String(raw).replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const center = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[center - 1] + sorted[center]) / 2
    : sorted[center];
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function analyzeTrend(input: {
  accessToken: string;
  userId: string;
  keyword: string;
  position: number;
}) {
  const predicted = await predictCategory({
    accessToken: input.accessToken,
    title: input.keyword,
    limit: 1,
  }).catch(() => []);

  const category = predicted[0];
  if (!category?.categoryId) return null;

  const [catalog, results] = await Promise.all([
    searchCatalogProducts({
      accessToken: input.accessToken,
      query: input.keyword,
      limit: 5,
    }).catch(() => []),
    searchMarketplace({
      accessToken: input.accessToken,
      query: input.keyword,
      categoryId: category.categoryId,
      limit: 16,
    }).catch(() => []),
  ]);

  const marketItems = results
    .filter(
      (item) =>
        item.sellerId !== input.userId &&
        item.price > 0,
    )
    .slice(0, 8);

  const catalogCandidates = await Promise.all(
    catalog.slice(0, 5).map(async (product) => {
      const details = await getCatalogProductDetails({
        accessToken: input.accessToken,
        productId: product.id,
      }).catch(() => null);

      if (!details) return null;

      const winnerId = details.buy_box_winner?.item_id ?? null;
      const currentPrice = winnerId
        ? await getItemCurrentPrice({
            accessToken: input.accessToken,
            itemId: winnerId,
          }).catch(() => null)
        : null;

      const price =
        currentPrice && currentPrice > 0
          ? currentPrice
          : Number(details.buy_box_winner?.price ?? 0);

      return price > 0
        ? {
            id: winnerId ?? product.id,
            title: details.name ?? product.name,
            price,
            categoryId:
              details.buy_box_winner?.category_id ?? category.categoryId,
          }
        : null;
    }),
  );

  const catalogPrices = catalogCandidates
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .map((item) => item.price);

  const highlights = await getCategoryHighlights({
    accessToken: input.accessToken,
    categoryId: category.categoryId,
  }).catch(() => null);

  const highlightContent = highlights?.content ?? [];
  const directBestSellerPositions = [
    ...marketItems.map((item) => item.id),
    ...catalogCandidates
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .map((item) => item.id),
  ]
    .map((id) => {
      const match = highlightContent.find(
        (highlight) => highlight.id === id,
      );
      return match?.position ?? null;
    })
    .filter((position): position is number => position != null);

  const bestSellerPosition =
    directBestSellerPositions.length > 0
      ? Math.min(...directBestSellerPositions)
      : null;



  const currentPrices = await Promise.all(
    marketItems.slice(0, 6).map(async (item) => {
      const price = await getItemCurrentPrice({
        accessToken: input.accessToken,
        itemId: item.id,
      }).catch(() => null);
      return price && price > 0 ? price : item.price;
    }),
  );

  const priceSample = [
    ...currentPrices.filter((value) => value > 0),
    ...catalogPrices,
  ].filter((value, index, array) => array.indexOf(value) === index);

  const marketMedian = median(priceSample);
  const marketAverage = average(priceSample);
  if (!marketMedian) return null;

  const dimensionSourceIds = [
    ...marketItems.slice(0, 4).map((item) => item.id),
    ...catalogCandidates
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, 4)
      .map((item) => item.id),
  ]
    .filter((id, index, array) => array.indexOf(id) === index)
    .slice(0, 4);

  const dimensionSamples = await Promise.all(
    dimensionSourceIds.map(async (itemId) => {
      const details = await getItemFullDetails({
        accessToken: input.accessToken,
        itemId,
      }).catch(() => null);

      if (!details) return null;

      const attrs = details.attributes ?? [];
      const sample = {
        heightCm: attributeNumber(attrs, PACKAGE_IDS.height),
        widthCm: attributeNumber(attrs, PACKAGE_IDS.width),
        lengthCm: attributeNumber(attrs, PACKAGE_IDS.length),
        weightGrams: attributeNumber(attrs, PACKAGE_IDS.weight),
      };

      return sample.heightCm &&
        sample.widthCm &&
        sample.lengthCm &&
        sample.weightGrams
        ? sample
        : null;
    }),
  );

  const complete = dimensionSamples.filter(
    (sample): sample is {
      heightCm: number;
      widthCm: number;
      lengthCm: number;
      weightGrams: number;
    } => sample !== null,
  );

  if (complete.length === 0) {
    return {
      keyword: input.keyword,
      position: input.position,
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      marketMedian,
      marketAverage,
      targetPurchasePrice: null,
      dimensionsConfidence: "NONE",
      comparableCount: priceSample.length,
      bestSellerPosition,
      bestSellerEvidence:
        bestSellerPosition != null ? "DIRECT_ITEM_MATCH" : "CATEGORY_ONLY",
      status: "NEEDS_DIMENSIONS",
    };
  }

  const dimensions = {
    heightCm: Math.round(
      median(complete.map((item) => item.heightCm)) as number,
    ),
    widthCm: Math.round(
      median(complete.map((item) => item.widthCm)) as number,
    ),
    lengthCm: Math.round(
      median(complete.map((item) => item.lengthCm)) as number,
    ),
    weightGrams: Math.round(
      median(complete.map((item) => item.weightGrams)) as number,
    ),
  };

  const [fee, shipping] = await Promise.all([
    getListingPriceQuote({
      accessToken: input.accessToken,
      price: marketMedian,
      categoryId: category.categoryId,
      listingType: "CLASSIC",
    }),
    getShippingQuote({
      accessToken: input.accessToken,
      userId: input.userId,
      price: marketMedian,
      listingType: "CLASSIC",
      ...dimensions,
    }),
  ]);

  const targetMargin = 0.2;
  const targetRoi = 0.3;
  const operatingCost = 1;

  const netBeforeProduct =
    marketMedian - fee.saleFeeAmount - shipping.shippingCost;
  const marginLimit =
    netBeforeProduct - operatingCost - marketMedian * targetMargin;
  const roiLimit =
    netBeforeProduct / (1 + targetRoi) - operatingCost;
  const targetPurchasePrice = Math.max(
    0,
    Math.min(marginLimit, roiLimit),
  );

  return {
    keyword: input.keyword,
    position: input.position,
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    marketMedian,
    marketAverage,
    targetPurchasePrice:
      Math.round(targetPurchasePrice * 100) / 100,
    dimensions,
    dimensionsConfidence:
      complete.length >= 3
        ? "HIGH"
        : complete.length === 2
          ? "MEDIUM"
          : "LOW",
    comparableCount: priceSample.length,
    bestSellerPosition,
    bestSellerEvidence:
      bestSellerPosition != null ? "DIRECT_ITEM_MATCH" : "CATEGORY_ONLY",
    feeAmount: fee.saleFeeAmount,
    shippingCost: shipping.shippingCost,
    status:
      targetPurchasePrice > 0
        ? "CANDIDATE"
        : "UNATTRACTIVE_AT_MEDIAN",
  };
}

export async function GET() {
  try {
    const session = await getMlSession();
    const trends = await getTrends({
      accessToken: session.accessToken,
    });

    const fastestGrowing = trends.slice(0, 12);

    const analyzed = [];
    for (let index = 0; index < fastestGrowing.length; index += 1) {
      const trend = fastestGrowing[index];
      const result = await analyzeTrend({
        accessToken: session.accessToken,
        userId: session.account.mercadoLivreUserId,
        keyword: trend.keyword,
        position: index + 1,
      }).catch(() => null);

      if (result) analyzed.push(result);
      if (analyzed.length >= 6) break;
    }

    return NextResponse.json({
      source: "MERCADO_LIVRE_WEEKLY_TRENDS",
      generatedAt: new Date().toISOString(),
      opportunities: analyzed,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao buscar oportunidades.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

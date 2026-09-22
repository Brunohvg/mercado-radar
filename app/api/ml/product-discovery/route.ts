import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCatalogProductDetails,
  getItemCurrentPrice,
  getItemFullDetails,
  getMlSession,
  predictCategory,
  searchCatalogProducts,
  searchMarketplace,
} from "@/lib/mercado-livre";

const schema = z.object({
  query: z.string().trim().min(3).max(180),
});

const DIMENSION_IDS = {
  height: "SELLER_PACKAGE_HEIGHT",
  width: "SELLER_PACKAGE_WIDTH",
  length: "SELLER_PACKAGE_LENGTH",
  weight: "SELLER_PACKAGE_WEIGHT",
} as const;

function numberFromAttribute(
  attributes: Array<{
    id?: string;
    value_name?: string;
    value_struct?: { number?: number; unit?: string } | null;
    values?: Array<{
      name?: string;
      struct?: { number?: number; unit?: string } | null;
    }>;
  }> | undefined,
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

  const text =
    attribute.value_name ??
    attribute.values?.find((value) => value.name)?.name ??
    "";
  const match = String(text).replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function isBarcode(value: string) {
  return /^\d{8,14}$/.test(value.replace(/\D/g, ""));
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Informe nome, EAN, GTIN ou código de barras." },
        { status: 400 },
      );
    }

    const session = await getMlSession();
    const rawQuery = parsed.data.query;
    const barcode = isBarcode(rawQuery)
      ? rawQuery.replace(/\D/g, "")
      : null;

    const catalog = await searchCatalogProducts({
      accessToken: session.accessToken,
      ...(barcode
        ? { productIdentifier: barcode }
        : { query: rawQuery }),
      limit: 5,
    }).catch(() => []);

    const catalogBest = catalog[0] ?? null;
    const catalogDetails = catalogBest
      ? await getCatalogProductDetails({
          accessToken: session.accessToken,
          productId: catalogBest.id,
        }).catch(() => null)
      : null;

    const searchTitle =
      catalogDetails?.name ??
      catalogBest?.name ??
      rawQuery;

    const predicted = await predictCategory({
      accessToken: session.accessToken,
      title: searchTitle,
      limit: 3,
    }).catch(() => []);

    const category = predicted[0] ?? null;
    const winnerItemId = catalogDetails?.buy_box_winner?.item_id ?? null;
    const winnerPrice = Number(catalogDetails?.buy_box_winner?.price ?? 0);

    let marketAccessBlocked = false;
    const market = await searchMarketplace({
      accessToken: session.accessToken,
      query: searchTitle,
      categoryId:
        category?.categoryId ??
        catalogDetails?.buy_box_winner?.category_id ??
        undefined,
      limit: 24,
    }).catch((error) => {
      marketAccessBlocked = true;
      return [];
    });

    const winnerFallback =
      market.length === 0 && winnerItemId
        ? [
            {
              id: winnerItemId,
              title: searchTitle,
              price: winnerPrice > 0 ? winnerPrice : 0,
              currencyId: "BRL",
              permalink: catalogDetails?.permalink ?? null,
              thumbnail: catalogBest?.pictures?.[0]?.url ?? null,
              categoryId:
                catalogDetails?.buy_box_winner?.category_id ?? null,
              sellerId:
                catalogDetails?.buy_box_winner?.seller_id == null
                  ? null
                  : String(catalogDetails.buy_box_winner.seller_id),
              listingTypeId: null,
              freeShipping: Boolean(
                catalogDetails?.buy_box_winner?.shipping?.free_shipping,
              ),
            },
          ]
        : [];

    const marketCandidates =
      market.length > 0 ? market : winnerFallback;

    const candidates = marketCandidates
      .filter(
        (item) =>
          item.sellerId !== session.account.mercadoLivreUserId &&
          item.price > 0,
      )
      .slice(0, 10);

    const enriched = await Promise.all(
      candidates.map(async (item) => {
        const [details, currentPrice] = await Promise.all([
          getItemFullDetails({
            accessToken: session.accessToken,
            itemId: item.id,
          }).catch(() => null),
          getItemCurrentPrice({
            accessToken: session.accessToken,
            itemId: item.id,
          }).catch(() => null),
        ]);

        const attributes = details?.attributes ?? [];

        return {
          ...item,
          price:
            currentPrice && currentPrice > 0 ? currentPrice : item.price,
          inferred: {
            heightCm: numberFromAttribute(
              attributes,
              DIMENSION_IDS.height,
            ),
            widthCm: numberFromAttribute(
              attributes,
              DIMENSION_IDS.width,
            ),
            lengthCm: numberFromAttribute(
              attributes,
              DIMENSION_IDS.length,
            ),
            weightGrams: numberFromAttribute(
              attributes,
              DIMENSION_IDS.weight,
            ),
          },
        };
      }),
    );

    const prices = enriched
      .map((item) => item.price)
      .filter((value) => Number.isFinite(value) && value > 0);

    const completeDimensions = enriched
      .map((item) => item.inferred)
      .filter(
        (item) =>
          item.heightCm &&
          item.widthCm &&
          item.lengthCm &&
          item.weightGrams,
      );

    const inferredDimensions =
      completeDimensions.length > 0
        ? {
            heightCm: Math.round(
              median(
                completeDimensions.map((item) => item.heightCm as number),
              ) as number,
            ),
            widthCm: Math.round(
              median(
                completeDimensions.map((item) => item.widthCm as number),
              ) as number,
            ),
            lengthCm: Math.round(
              median(
                completeDimensions.map((item) => item.lengthCm as number),
              ) as number,
            ),
            weightGrams: Math.round(
              median(
                completeDimensions.map((item) => item.weightGrams as number),
              ) as number,
            ),
          }
        : null;

    const sortedPrices = [...prices].sort((a, b) => a - b);

    return NextResponse.json({
      identification: {
        input: rawQuery,
        barcode,
        source: catalogBest ? "CATALOG" : "MARKETPLACE",
        catalogProductId: catalogBest?.id ?? null,
        name: catalogBest?.name ?? searchTitle,
        categoryId:
          category?.categoryId ??
          catalogDetails?.buy_box_winner?.category_id ??
          null,
        categoryName: category?.categoryName ?? null,
        domainName: category?.domainName ?? null,
      },
      market: {
        comparableCount: enriched.length,
        minimumPrice:
          sortedPrices.length > 0 ? sortedPrices[0] : null,
        medianPrice: median(sortedPrices),
        maximumPrice:
          sortedPrices.length > 0
            ? sortedPrices[sortedPrices.length - 1]
            : null,
        source:
          market.length > 0
            ? "MARKETPLACE_SEARCH"
            : winnerFallback.length > 0
              ? "CATALOG_WINNER"
              : "UNAVAILABLE",
        accessBlocked: marketAccessBlocked,
      },
      dimensions: inferredDimensions
        ? {
            ...inferredDimensions,
            source: "SIMILAR_LISTINGS",
            sampleSize: completeDimensions.length,
            confidence:
              completeDimensions.length >= 5
                ? "HIGH"
                : completeDimensions.length >= 2
                  ? "MEDIUM"
                  : "LOW",
          }
        : null,
      comparables: enriched.slice(0, 6).map((item) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        permalink: item.permalink,
        thumbnail: item.thumbnail,
        freeShipping: item.freeShipping,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao identificar o produto.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

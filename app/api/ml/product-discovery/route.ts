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
import { DIMENSION_IDS, numberFromAttribute } from "@/lib/ml-physical-measures";

const schema = z.object({
  query: z.string().trim().min(3).max(180),
});


function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
    // An EAN without a matching catalog product is NOT an identified product.
    // Do not guess a category or generate a misleading product title.
    if (barcode && !catalogBest) {
      return NextResponse.json({
        categorySuggestions: [],
        identification: {
          input: rawQuery,
          barcode,
          source: "UNVERIFIED",
          verified: false,
          requiresProductName: true,
          name: null,
          categoryId: null,
          categoryName: null,
          domainName: null,
        },
        market: {
          comparableCount: 0, minimumPrice: null, averagePrice: null,
          medianPrice: null, maximumPrice: null, source: "UNAVAILABLE",
          accessBlocked: false,
        },
        dimensions: null,
        comparables: [],
        notice: "Não encontramos correspondência confiável para este EAN. Informe o nome comercial do produto para consultar categorias e preços.",
      });
    }
    const catalogDetails = catalogBest
      ? await getCatalogProductDetails({
          accessToken: session.accessToken,
          productId: catalogBest.id,
        }).catch(() => null)
      : null;

    const catalogPeerDetails = await Promise.all(
      catalog.slice(0, 5).map(async (product) => {
        const details =
          product.id === catalogBest?.id && catalogDetails
            ? catalogDetails
            : await getCatalogProductDetails({
                accessToken: session.accessToken,
                productId: product.id,
              }).catch(() => null);

        if (!details) return null;

        const winnerItemId = details.buy_box_winner?.item_id ?? null;
        const currentPrice = winnerItemId
          ? await getItemCurrentPrice({
              accessToken: session.accessToken,
              itemId: winnerItemId,
            }).catch(() => null)
          : null;

        const price =
          currentPrice && currentPrice > 0
            ? currentPrice
            : Number(details.buy_box_winner?.price ?? 0);

        return {
          product,
          details,
          winnerItemId,
          price,
        };
      }),
    );

    const catalogStrategy = (() => {
      const strategy = catalogDetails?.settings?.listing_strategy ?? "unknown";
      const exclusive = catalogDetails?.settings?.exclusive === true;
      if (exclusive || strategy === "catalog_only") return {
        status: "CATALOG_ONLY" as const,
        recommendation: "CATALOG_REQUIRED" as const,
        reason: "A API indica catálogo exclusivo. Não é permitido recomendar anúncio tradicional como alternativa.",
      };
      if (strategy === "catalog_required") return {
        status: "CATALOG_REQUIRED" as const,
        recommendation: "CATALOG_REQUIRED" as const,
        reason: "O produto exige presença no catálogo. Confirme que o código e todos os atributos do item são idênticos antes de associar.",
      };
      if (catalogDetails?.children_ids?.length) return {
        status: "PARENT_PRODUCT" as const,
        recommendation: "REVIEW" as const,
        reason: "O produto encontrado é pai e possui variantes. Escolha um produto filho específico antes de anunciar em catálogo.",
      };
      if (!catalogBest || !catalogDetails) return {
        status: "UNCONFIRMED" as const,
        recommendation: "REVIEW" as const,
        reason: "Nenhum produto exato e verificável do catálogo foi confirmado. O Radar não pode afirmar que há elegibilidade.",
      };
      if (!barcode) return {
        status: "MATCH_UNCONFIRMED" as const,
        recommendation: "REVIEW" as const,
        reason: "Há referência de catálogo por nome, mas falta confirmar EAN, apresentação, volume e demais características.",
      };
      if (catalogBest.status !== "active" || catalogDetails.status !== "active") return {
        status: "NOT_ACTIVE" as const,
        recommendation: "REVIEW" as const,
        reason: "O produto localizado não consta como ativo para associação direta ao catálogo.",
      };
      return {
        status: "MATCH_FOUND" as const,
        recommendation: "COMPARE" as const,
        reason: "EAN localizado em produto ativo. Confirme que a embalagem é idêntica. A elegibilidade da sua conta e eventual obrigatoriedade de catálogo ainda precisam ser validadas na API.",
      };
    })();

    const catalogPeerPrices = catalogPeerDetails
      .map((entry) => Number(entry?.price ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0);

    const searchTitle =
      catalogDetails?.name ??
      catalogBest?.name ??
      rawQuery;

    const predicted = await predictCategory({
      accessToken: session.accessToken,
      title: searchTitle,
      limit: 3,
    }).catch(() => []);

    // Mostra alternativas reais ao vendedor: a primeira previsão não é confirmação.
    const categorySuggestions: Array<{ categoryId: string; categoryName: string; source: "PREDICTED" | "CATALOG" }> = predicted.map((item) => ({
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      source: "PREDICTED" as const,
    }));
    const catalogCategoryId = catalogDetails?.buy_box_winner?.category_id;
    if (catalogCategoryId && !categorySuggestions.some(
      (item) => item.categoryId === catalogCategoryId,
    )) {
      categorySuggestions.push({
        categoryId: catalogCategoryId,
        categoryName: "Categoria do anúncio de referência",
        source: "CATALOG" as const,
      });
    }
    // Display the complete real category path and publication permission,
    // not a collection of indistinguishable IDs.
    const confirmedSuggestions = await Promise.all(
      categorySuggestions.slice(0, 5).map(async (suggestion) => {
        try {
          const res = await fetch("https://api.mercadolibre.com/categories/" + encodeURIComponent(suggestion.categoryId), {
            headers: { Authorization: "Bearer " + session.accessToken },
            cache: "no-store", signal: AbortSignal.timeout(9000),
          });
          if (!res.ok) return { ...suggestion, path: null, listingAllowed: null };
          const details = await res.json() as {
            path_from_root?: Array<{ id?: string; name?: string }>;
            settings?: { listing_allowed?: boolean };
          };
          const categoryPath = (details.path_from_root ?? [])
            .map(x => x.name).filter(Boolean).join(" › ");
          return {
            ...suggestion,
            path: categoryPath || suggestion.categoryName,
            listingAllowed: details.settings?.listing_allowed ?? null,
          };
        } catch {
          return { ...suggestion, path: null, listingAllowed: null };
        }
      }),
    );
    const category = predicted.find(x => x.categoryId === catalogCategoryId) ?? predicted[0] ?? null;
    // The seller's catalog-reference category is more trustworthy than another
    // predicted category with the same display name.
    const preferredId = catalogCategoryId ?? category?.categoryId ?? null;
    confirmedSuggestions.sort((a, b) =>
      Number(b.categoryId === preferredId) - Number(a.categoryId === preferredId));
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

    const marketplacePrices = enriched
      .map((item) => item.price)
      .filter((value) => Number.isFinite(value) && value > 0);

    const prices =
      marketplacePrices.length >= 3
        ? marketplacePrices
        : [...marketplacePrices, ...catalogPeerPrices].filter(
            (value, index, array) => array.indexOf(value) === index,
          );

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
      categorySuggestions: confirmedSuggestions,
      catalogStrategy: {
        ...catalogStrategy,
        productId: catalogBest?.id ?? null,
        listingStrategy: catalogDetails?.settings?.listing_strategy ?? "unknown",
        catalogExclusive: catalogDetails?.settings?.exclusive === true,
        productName: catalogDetails?.name ?? catalogBest?.name ?? null,
        competitionPrice: catalogPeerPrices.length ? median(catalogPeerPrices) : null,
        restrictions: [
          "A ficha técnica da página de catálogo é definida pelo Mercado Livre.",
          "O produto anunciado deve coincidir exatamente com o ID de catálogo.",
          "Kits ou quantidades diferentes exigem produto de catálogo correspondente; não use o EAN do frasco unitário para um kit.",
          "O Radar não altera o modo de publicação automaticamente.",
        ],
      },
      categoryNotice: confirmedSuggestions.length > 1
        ? "O Mercado Livre retornou categorias diferentes. A referência do catálogo tem prioridade, mas confira os atributos antes de publicar."
        : null,
      identification: {
        input: rawQuery,
        barcode,
        source: catalogBest ? "CATALOG" : "MARKETPLACE",
        verified: Boolean(catalogBest),
        requiresProductName: false,
        catalogProductId: catalogBest?.id ?? null,
        name: catalogBest?.name ?? searchTitle,
        brand: (catalogDetails?.attributes ?? [])
          .find(x => x.id === "BRAND")?.value_name ?? null,
        categoryId: preferredId,
        categoryName: confirmedSuggestions.find(x => x.categoryId === preferredId)?.path?.split(" › ").at(-1)
          ?? confirmedSuggestions.find(x => x.categoryId === preferredId)?.categoryName ?? null,
        domainName: category?.domainName ?? null,
      },
      market: {
        comparableCount: prices.length,
        minimumPrice:
          sortedPrices.length > 0 ? sortedPrices[0] : null,
        averagePrice: average(sortedPrices),
        medianPrice: median(sortedPrices),
        maximumPrice:
          sortedPrices.length > 0
            ? sortedPrices[sortedPrices.length - 1]
            : null,
        source:
          market.length > 0
            ? "MARKETPLACE_SEARCH"
            : catalogPeerPrices.length > 0
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
      comparables:
        enriched.length > 0
          ? enriched.slice(0, 6).map((item) => ({
              id: item.id,
              title: item.title,
              price: item.price,
              permalink: item.permalink,
              thumbnail: item.thumbnail,
              freeShipping: item.freeShipping,
            }))
          : catalogPeerDetails
              .filter((entry) => entry && entry.price > 0)
              .slice(0, 6)
              .map((entry) => ({
                id: String(entry!.winnerItemId ?? entry!.product.id),
                title: entry!.details.name ?? entry!.product.name,
                price: entry!.price,
                permalink: entry!.details.permalink ?? null,
                thumbnail: entry!.product.pictures?.[0]?.url ?? null,
                freeShipping: Boolean(
                  entry!.details.buy_box_winner?.shipping?.free_shipping,
                ),
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

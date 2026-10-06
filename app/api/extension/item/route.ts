import { NextResponse } from "next/server";
import { z } from "zod";
import { isExtensionAuthorized } from "@/lib/extension-auth";
import {
  getCatalogProductDetails,
  getItemCurrentPrice,
  getItemsBulk,
  getItemsByUserProduct,
  getItemsVisitTotals,
  getMlSession,
  getTrends,
  getUserProductDetails,
} from "@/lib/mercado-livre";
import { calculateRadarOpportunityScore } from "@/lib/radar-score";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().trim().regex(/^MLB(?:U)?\d+$/i),
  visiblePrice: z.coerce.number().positive().optional(),
});

async function resolveItemId(input: {
  accessToken: string;
  referenceId: string;
  visiblePrice?: number;
}) {
  const referenceId = input.referenceId.toUpperCase();

  if (/^MLB\d+$/.test(referenceId)) {
    return referenceId;
  }

  const userProduct = await getUserProductDetails({
    accessToken: input.accessToken,
    userProductId: referenceId,
  });

  if (userProduct.user_id == null) {
    throw new Error("User Product sem seller associado.");
  }

  const itemIds = await getItemsByUserProduct({
    accessToken: input.accessToken,
    userId: String(userProduct.user_id),
    userProductId: referenceId,
  });

  if (itemIds.length === 0) {
    throw new Error("Nenhum anúncio associado ao User Product.");
  }

  if (itemIds.length === 1 || !input.visiblePrice) {
    return itemIds[0];
  }

  const details = await getItemsBulk({
    accessToken: input.accessToken,
    itemIds,
  });

  const ranked = details
    .filter((item) => item.currentPrice > 0)
    .sort(
      (a, b) =>
        Math.abs(a.currentPrice - input.visiblePrice!) -
        Math.abs(b.currentPrice - input.visiblePrice!),
    );

  return ranked[0]?.id ?? itemIds[0];
}

export async function GET(request: Request) {
  if (!isExtensionAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = schema.safeParse({
    id: url.searchParams.get("id") ?? "",
    visiblePrice: url.searchParams.get("visiblePrice") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Referência inválida." }, { status: 400 });
  }

  try {
    const session = await getMlSession();
    const itemId = await resolveItemId({
      accessToken: session.accessToken,
      referenceId: parsed.data.id,
      visiblePrice: parsed.data.visiblePrice,
    });

    const [details, price, visits] = await Promise.all([
      getItemsBulk({
        accessToken: session.accessToken,
        itemIds: [itemId],
      }),
      getItemCurrentPrice({
        accessToken: session.accessToken,
        itemId,
      }).catch(() => null),
      getItemsVisitTotals({
        accessToken: session.accessToken,
        itemIds: [itemId],
      }).catch(() => ({} as Record<string, number>)),
    ]);

    const item = details[0];
    if (!item) {
      return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
    }

    const currentPrice =
      price && price > 0
        ? price
        : item.currentPrice > 0
          ? item.currentPrice
          : parsed.data.visiblePrice ?? 0;

    const intelligence = calculateRadarOpportunityScore({
      price: currentPrice,
      soldQuantity: item.soldQuantity,
      visits: visits[item.id] ?? null,
      dateCreated: item.dateCreated,
      freeShipping: item.freeShipping,
      listingTypeId: item.listingTypeId,
    });

    const [catalog, trends] = await Promise.all([
      item.catalogProductId
        ? getCatalogProductDetails({
            accessToken: session.accessToken,
            productId: item.catalogProductId,
          }).catch(() => null)
        : Promise.resolve(null),
      item.categoryId
        ? getTrends({
            accessToken: session.accessToken,
            categoryId: item.categoryId,
          }).catch(() => [])
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      referenceId: parsed.data.id.toUpperCase(),
      resolvedItemId: item.id,
      item: {
        id: item.id,
        title: item.title,
        price: currentPrice,
        categoryId: item.categoryId,
        sellerId: item.sellerId,
        listingTypeId: item.listingTypeId,
        freeShipping: item.freeShipping,
        soldQuantity: item.soldQuantity,
        availableQuantity: item.availableQuantity,
        visits: visits[item.id] ?? null,
        dateCreated: item.dateCreated,
        catalogProductId: item.catalogProductId,
        userProductId: item.userProductId,
        permalink: item.permalink,
        thumbnail: item.thumbnail,
        intelligence,
      },
      catalog: catalog
        ? {
            id: catalog.id ?? item.catalogProductId,
            name: catalog.name ?? catalog.family_name ?? null,
            soldQuantity: catalog.sold_quantity ?? null,
            buyBoxWinner: catalog.buy_box_winner
              ? {
                  itemId: catalog.buy_box_winner.item_id ?? null,
                  sellerId:
                    catalog.buy_box_winner.seller_id == null
                      ? null
                      : String(catalog.buy_box_winner.seller_id),
                  price: catalog.buy_box_winner.price ?? null,
                  soldQuantity: catalog.buy_box_winner.sold_quantity ?? null,
                  freeShipping:
                    catalog.buy_box_winner.shipping?.free_shipping ?? null,
                  logisticType:
                    catalog.buy_box_winner.shipping?.logistic_type ?? null,
                }
              : null,
          }
        : null,
      trends: trends.slice(0, 8),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao analisar anúncio.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

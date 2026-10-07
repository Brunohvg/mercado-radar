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

    return NextResponse.json({
      query: parsed.data.query,
      items,
      generatedAt: new Date().toISOString(),
      source: "VISIBLE_MERCADO_LIVRE_PAGE",
      note:
        "Os anúncios vieram da página que o usuário está vendo. O Radar apenas enriqueceu os IDs com APIs oficiais disponíveis.",
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

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isExtensionAuthorized } from "@/lib/extension-auth";
import {
  getItemsBulk,
  getItemsVisitTotals,
  getMlSession,
  searchMarketplace,
} from "@/lib/mercado-livre";
import { calculateRadarOpportunityScore } from "@/lib/radar-score";
import { calculateRadarMomentum } from "@/lib/radar-momentum";

export const dynamic = "force-dynamic";

const schema = z.object({
  q: z.string().trim().min(2).max(180),
});

export async function GET(request: Request) {
  if (!isExtensionAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = schema.safeParse({ q: url.searchParams.get("q") ?? "" });

  if (!parsed.success) {
    return NextResponse.json({ error: "Pesquisa inválida.", items: [] }, { status: 400 });
  }

  try {
    const session = await getMlSession();
    const marketplace = await searchMarketplace({
      accessToken: session.accessToken,
      query: parsed.data.q,
      limit: 50,
    });

    const itemIds = marketplace.map((item) => item.id);
    const [details, visits, watched] = await Promise.all([
      getItemsBulk({
        accessToken: session.accessToken,
        itemIds,
      }),
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

    const detailById = new Map(details.map((item) => [item.id, item]));

    const items = marketplace.map((searchItem) => {
      const detail = detailById.get(searchItem.id);
      const price =
        searchItem.price > 0
          ? searchItem.price
          : detail?.currentPrice ?? 0;
      const itemVisits = visits[searchItem.id] ?? null;

      const intelligence = calculateRadarOpportunityScore({
        price,
        soldQuantity: detail?.soldQuantity ?? 0,
        visits: itemVisits,
        dateCreated: detail?.dateCreated ?? null,
        freeShipping: searchItem.freeShipping || detail?.freeShipping,
        listingTypeId: searchItem.listingTypeId ?? detail?.listingTypeId ?? null,
      });

      const watch = watchByItemId.get(searchItem.id) ?? null;

      return {
        id: searchItem.id,
        title: searchItem.title,
        price,
        categoryId: searchItem.categoryId ?? detail?.categoryId ?? null,
        sellerId: searchItem.sellerId ?? detail?.sellerId ?? null,
        listingTypeId:
          searchItem.listingTypeId ?? detail?.listingTypeId ?? null,
        freeShipping: searchItem.freeShipping || Boolean(detail?.freeShipping),
        soldQuantity: detail?.soldQuantity ?? 0,
        availableQuantity: detail?.availableQuantity ?? 0,
        visits: itemVisits,
        dateCreated: detail?.dateCreated ?? null,
        catalogProductId: detail?.catalogProductId ?? null,
        userProductId: detail?.userProductId ?? null,
        permalink: searchItem.permalink ?? detail?.permalink ?? null,
        thumbnail: searchItem.thumbnail ?? detail?.thumbnail ?? null,
        intelligence,
        monitored: Boolean(watch),
        momentum: watch?.momentum ?? null,
      };
    });

    return NextResponse.json({
      query: parsed.data.q,
      items,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao enriquecer a busca.";

    return NextResponse.json({ error: message, items: [] }, { status: 502 });
  }
}

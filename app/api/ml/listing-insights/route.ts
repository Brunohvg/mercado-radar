import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getCatalogCompetition,
  getExistingItemShippingQuote,
  getListingPriceQuote,
  getMlSession,
  getCatalogProductOffersSnapshot,
  searchMarketplaceWithSource,
} from "@/lib/mercado-livre";
import { summarizePrices } from "@/lib/market-stats";
import { analyzeProfitability } from "@/lib/profitability";
import { buildCompetitivePriceStrategy } from "@/lib/price-strategy";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().trim().regex(/^MLB\d+$/i),
});

const round2 = (value: number | null) =>
  value == null
    ? null
    : Math.round((value + Number.EPSILON) * 100) / 100;

function listingTypeFromId(value: string | null) {
  return value === "gold_pro" ? ("PREMIUM" as const) : ("CLASSIC" as const);
}

function decimal(value: unknown) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

type SnapshotCompetitor = {
  id?: string;
  title?: string;
  price?: number;
  searchPosition?: number;
  sellerId?: string | null;
  freeShipping?: boolean;
  logisticType?: string | null;
};

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

    const [latestSnapshot, competition] = await Promise.all([
      prisma.marketSnapshot.findFirst({
        where: {
          sellerUserId,
          mlItemId: itemId,
        },
        orderBy: { createdAt: "desc" },
      }),
      product.catalogProductId
        ? getCatalogCompetition({
            accessToken: session.accessToken,
            itemId,
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const snapshotCompetitors = Array.isArray(latestSnapshot?.competitors)
      ? (latestSnapshot?.competitors as SnapshotCompetitor[])
      : [];

    const compactCompetitors = snapshotCompetitors
      .filter((item) => item.id && Number(item.price) > 0)
      .slice(0, 8)
      .map((item) => ({
        id: String(item.id),
        title: item.title ?? "Anúncio observado na busca",
        price: round2(Number(item.price)),
        freeShipping: Boolean(item.freeShipping),
        listingTypeId: null as string | null,
        similarityPercent: null,
        searchPosition: item.searchPosition ?? null,
        logisticType: item.logisticType ?? null,
        source: "EXTENSION_SEARCH",
      }));

    if (
      competition?.winner?.item_id &&
      String(competition.winner.item_id).toUpperCase() !== itemId &&
      Number(competition.winner.price) > 0 &&
      !compactCompetitors.some(
        (item) =>
          item.id === String(competition.winner?.item_id).toUpperCase(),
      )
    ) {
      const winnerBoosts = competition.winner.boosts ?? [];
      compactCompetitors.unshift({
        id: String(competition.winner.item_id).toUpperCase(),
        title: "Vencedor atual do catálogo",
        price: round2(Number(competition.winner.price)),
        freeShipping: winnerBoosts.some(
          (boost) =>
            boost.id === "free_shipping" && boost.status === "boosted",
        ),
        listingTypeId: null,
        similarityPercent: null,
        searchPosition: null,
        logisticType: winnerBoosts.some(
          (boost) =>
            boost.id === "fulfillment" && boost.status === "boosted",
        )
          ? "fulfillment"
          : null,
        source: "CATALOG_WINNER",
      });
    }

    // Mercado: a captura da extensão vale por 7 dias; sem ela, buscamos ao vivo as
    // ofertas do catálogo (ou a busca, quando liberada) e dizemos a fonte.
    const snapshotFresh = latestSnapshot && Date.now() - latestSnapshot.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000;
    let marketSource: "EXTENSAO" | "CATALOGO" | "BUSCA" | "SEM_DADOS" = snapshotFresh ? "EXTENSAO" : "SEM_DADOS";
    let marketNotice: string | null = null;
    let livePrices: number[] = [];
    if (!snapshotFresh) {
      if (product.catalogProductId) {
        const snap = await getCatalogProductOffersSnapshot({ accessToken: session.accessToken, productId: product.catalogProductId, limit: 50 }).catch(() => null);
        const others = (snap?.offers ?? []).filter((o) => o.itemId !== itemId && o.sellerId !== sellerUserId);
        if (others.length) {
          marketSource = "CATALOGO";
          livePrices = others.map((o) => o.price);
          compactCompetitors.push(...others.sort((a, b) => a.price - b.price).slice(0, 8).map((o) => ({
            id: o.itemId, title: "Oferta no mesmo catálogo", price: round2(o.price), freeShipping: o.freeShipping,
            listingTypeId: null, similarityPercent: null, searchPosition: null, logisticType: o.logisticType, source: "CATALOG_OFFER",
          })));
        }
      } else {
        const found = await searchMarketplaceWithSource({ accessToken: session.accessToken, query: product.title, categoryId: product.categoryId ?? undefined, limit: 30 }).catch(() => null);
        const others = (found?.items ?? []).filter((i) => i.id !== itemId && i.sellerId !== sellerUserId);
        if (found && others.length) {
          marketSource = found.source === "BUSCA" ? "BUSCA" : "CATALOGO";
          marketNotice = found.notice;
          livePrices = others.map((i) => i.price);
          compactCompetitors.push(...others.slice(0, 8).map((i, index) => ({
            id: i.id, title: i.title, price: round2(i.price), freeShipping: i.freeShipping, listingTypeId: i.listingTypeId,
            similarityPercent: null, searchPosition: found.source === "BUSCA" ? index + 1 : null, logisticType: null,
            source: found.source === "BUSCA" ? "LIVE_SEARCH" : "CATALOG_OFFER",
          })));
        } else if (found?.notice) marketNotice = found.notice;
      }
    }

    const market = marketSource === "EXTENSAO"
      ? {
          count: latestSnapshot?.resultCount ?? compactCompetitors.length,
          minimum: decimal(latestSnapshot?.minimumPrice),
          p25: decimal(latestSnapshot?.p25Price),
          median: decimal(latestSnapshot?.medianPrice),
          p75: decimal(latestSnapshot?.p75Price),
          maximum: decimal(latestSnapshot?.maximumPrice),
          average: decimal(latestSnapshot?.averagePrice),
          gapToMedian: decimal(latestSnapshot?.marketGapPercent),
          cheaperThanYou: null as number | null,
          source: marketSource,
          notice: marketNotice,
        }
      : { ...summarizePrices(livePrices, currentPrice), source: marketSource, notice: marketNotice };

    let unitCost =
      product.supplierPrice == null
        ? null
        : Number(product.supplierPrice) *
          (1 - Number(product.discountPercent) / 100);

    if (unitCost == null && product.sku) {
      const local = await prisma.product.findUnique({
        where: { workspaceId_sku: { workspaceId: session.account.workspaceId, sku: product.sku } },
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
    const settingsRow = await prisma.appSettings.findUnique({ where: { id: session.account.workspaceId }, select: { taxPercent: true } });
    let profitabilityNote: string | null =
      unitCost == null
        ? "Cadastre o custo do produto para ver lucro e piso."
        : settingsRow?.taxPercent == null
          ? "Confirme seu imposto em Configurações para ver lucro e piso."
          : !product.categoryId || currentPrice == null || currentPrice <= 0
            ? "Sincronize os anúncios para calcular tarifa e frete deste item."
            : null;

    if (
      profitabilityNote == null &&
      unitCost != null &&
      currentPrice != null &&
      currentPrice > 0 &&
      product.categoryId
    ) {
      const listingType = listingTypeFromId(product.listingTypeId);
      const settings = await prisma.appSettings.findUnique({
        where: { id: session.account.workspaceId },
      });

      const targetMarginPercent = Number(
        settings?.targetMarginPercent ?? 20,
      );
      const targetRoiPercent = Number(settings?.targetRoiPercent ?? 30);
      const operatingCost = Number(
        settings?.operatingCostDefault ?? 1,
      );

      const quotes = await Promise.all([
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
        }),
      ]).catch((e: unknown) => {
        // Sem tarifa ou frete oficial não há lucro honesto; o resto do painel continua.
        profitabilityNote = `O Mercado Livre não devolveu tarifa ou frete deste anúncio agora (${e instanceof Error ? e.message : "erro"}). Tente de novo em instantes.`;
        return null;
      });
      if (quotes) {
      const [fee, shipping] = quotes;

      profitability = analyzeProfitability({
        productName: product.title,
        supplierPrice: unitCost,
        discountPercent: 0,
        kitQuantity: 1,
        salePrice: currentPrice,
        listingType,
        commissionPercent: fee.commissionPercent,
        fixedFee: fee.fixedFee,
        quotedSaleFeeAmount: fee.saleFeeAmount,
        shippingCost: shipping.shippingCost,
        operatingCost,
        taxPercent: Number(settings?.taxPercent ?? 0),
        targetMarginPercent,
        targetRoiPercent,
      });

      const marketReferencePrice =
        market.p25 != null && market.p25 > 0
          ? market.p25
          : competition?.price_to_win != null &&
              Number(competition.price_to_win) > 0
            ? Number(competition.price_to_win)
            : competition?.winner?.price != null &&
                Number(competition.winner.price) > 0
              ? Number(competition.winner.price)
              : null;

      if (marketReferencePrice != null) {
        strategy = profitability.minimumSuggestedPrice == null ? null : buildCompetitivePriceStrategy({
          currentPrice,
          marketReferencePrice,
          minimumSuggestedPrice: profitability.minimumSuggestedPrice,
          breakEvenPrice: profitability.breakEvenPrice,
        });
      }
      }
    }

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
        position: latestSnapshot?.position ?? null,
        searched: latestSnapshot?.resultCount ?? 0,
        source: latestSnapshot ? "EXTENSION_SEARCH" : "NOT_CAPTURED",
        capturedAt: latestSnapshot?.createdAt ?? null,
        note: latestSnapshot
          ? "Posição capturada diretamente na página de busca do Mercado Livre pela Extensão Radar."
          : "Abra uma busca relevante no Mercado Livre com a Extensão Radar ativa para capturar a posição orgânica deste anúncio.",
      },
      catalogCompetition: competition
        ? {
            status: competition.status ?? null,
            priceToWin:
              competition.price_to_win == null
                ? null
                : Number(competition.price_to_win),
            visitShare: competition.visit_share ?? null,
            competitorsSharingFirstPlace:
              competition.competitors_sharing_first_place ?? null,
            consistent: competition.consistent ?? null,
            reasons: competition.reason ?? [],
            winner: competition.winner
              ? {
                  itemId: competition.winner.item_id ?? null,
                  price:
                    competition.winner.price == null
                      ? null
                      : Number(competition.winner.price),
                }
              : null,
          }
        : null,
      market,
      profitability,
      profitabilityNote,
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

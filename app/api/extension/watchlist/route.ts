import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getExtensionSession } from "@/lib/extension-auth";
import {
  getItemCurrentPrice,
  getItemsBulk,
  getItemsVisitTotals,
} from "@/lib/mercado-livre";
import { calculateRadarOpportunityScore } from "@/lib/radar-score";
import {
  observationSchema,
  referenceIdSchema,
} from "@/lib/extension-observation";
import { recordObservations } from "@/lib/market-intel";
import { savePageWatch } from "@/lib/page-watchlist";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  itemId: referenceIdSchema,
  observation: observationSchema.optional(),
  referenceId: z.string().trim().max(40).optional(),
});

export async function GET(request: Request) {
  let extensionSession;
  try {
    extensionSession = await getExtensionSession(request);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao validar sessão da extensão.",
      },
      { status: 429 },
    );
  }

  if (!extensionSession) {
    return NextResponse.json(
      { error: "Sessão da extensão inválida ou expirada." },
      { status: 401 },
    );
  }

  try {
    const session = extensionSession.ml;
    const items = await prisma.radarWatchItem.findMany({
      where: {
        sellerUserId: session.account.mercadoLivreUserId,
        active: true,
      },
      orderBy: { updatedAt: "desc" },
      include: {
        snapshots: {
          orderBy: { capturedAt: "desc" },
          take: 12,
        },
      },
    });

    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        mlItemId: item.mlItemId,
        referenceId: item.referenceId,
        title: item.title,
        permalink: item.permalink,
        thumbnail: item.thumbnail,
        currentPrice:
          item.currentPrice == null ? null : Number(item.currentPrice),
        score: item.score,
        demandLabel: item.demandLabel,
        soldQuantity: item.soldKnown ? item.soldQuantity : null,
        soldIsLowerBound: item.soldIsLowerBound,
        trackingMode: item.trackingMode,
        visits: item.visits,
        lastCheckedAt: item.lastCheckedAt,
        createdAt: item.createdAt,
        snapshots: item.snapshots.map((snapshot) => ({
          price: snapshot.price == null ? null : Number(snapshot.price),
          score: snapshot.score,
          demandLabel: snapshot.demandLabel,
          soldQuantity: snapshot.soldKnown ? snapshot.soldQuantity : null,
          soldIsLowerBound: snapshot.soldIsLowerBound,
          trackingMode: snapshot.trackingMode,
          visits: snapshot.visits,
          capturedAt: snapshot.capturedAt,
        })),
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao carregar monitoramento.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  let extensionSession;
  try {
    extensionSession = await getExtensionSession(request);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao validar sessão da extensão.",
      },
      { status: 429 },
    );
  }

  if (!extensionSession) {
    return NextResponse.json(
      { error: "Sessão da extensão inválida ou expirada." },
      { status: 401 },
    );
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Anúncio inválido." }, { status: 400 });
  }

  try {
    const session = extensionSession.ml;
    const itemId = parsed.data.itemId.toUpperCase();

    if (parsed.data.observation) {
      if (parsed.data.observation.id !== itemId)
        return NextResponse.json(
          { error: "A leitura não corresponde ao anúncio selecionado." },
          { status: 400 },
        );
      const observation = parsed.data.observation;
      await recordObservations({
        workspaceId: session.account.workspaceId,
        sellerUserId: session.account.mercadoLivreUserId,
        source: "PRODUCT_PAGE",
        listings: [observation],
      });
      const watchItem = await savePageWatch(
        session.account.mercadoLivreUserId,
        observation,
        true,
      );
      return NextResponse.json({
        ok: true,
        trackingMode: watchItem?.trackingMode ?? "PAGE",
        watchItem,
        note:
          watchItem?.trackingMode === "API"
            ? "Este anúncio já é acompanhado pela API. As leituras públicas também ficam no seu histórico de mercado."
            : "Salvo. O histórico será atualizado quando você visitar o anúncio com o painel aberto. A API não garante acompanhamento em segundo plano para terceiros.",
      });
    }
    if (!/^MLB\d+$/.test(itemId))
      return NextResponse.json(
        {
          error:
            "Abra a página deste produto para salvar uma leitura no monitoramento.",
        },
        { status: 422 },
      );
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
      }).catch(() => ({}) as Record<string, number>),
    ]);

    const item = details[0];
    if (!item) {
      return NextResponse.json(
        {
          error:
            "A API não disponibilizou este anúncio. Abra sua página e monitore pela leitura visível.",
        },
        { status: 422 },
      );
    }

    const currentPrice =
      price && price > 0
        ? price
        : item.currentPrice > 0
          ? item.currentPrice
          : null;
    const itemVisits = visits[item.id] ?? null;
    const intelligence = calculateRadarOpportunityScore({
      price: currentPrice ?? 0,
      soldQuantity: item.soldQuantity,
      visits: itemVisits,
      dateCreated: item.dateCreated,
      freeShipping: item.freeShipping,
      listingTypeId: item.listingTypeId,
    });

    const watchItem = await prisma.radarWatchItem.upsert({
      where: {
        sellerUserId_mlItemId: {
          sellerUserId: session.account.mercadoLivreUserId,
          mlItemId: item.id,
        },
      },
      create: {
        sellerUserId: session.account.mercadoLivreUserId,
        mlItemId: item.id,
        referenceId: parsed.data.referenceId ?? null,
        title: item.title,
        permalink: item.permalink,
        thumbnail: item.thumbnail,
        currentPrice,
        score: intelligence.score,
        demandLabel: intelligence.demandLabel,
        soldQuantity: item.soldQuantity,
        visits: itemVisits,
        active: true,
        lastCheckedAt: new Date(),
      },
      update: {
        referenceId: parsed.data.referenceId ?? undefined,
        title: item.title,
        permalink: item.permalink,
        thumbnail: item.thumbnail,
        currentPrice,
        score: intelligence.score,
        demandLabel: intelligence.demandLabel,
        soldQuantity: item.soldQuantity,
        visits: itemVisits,
        active: true,
        lastCheckedAt: new Date(),
      },
    });

    await prisma.radarWatchSnapshot.create({
      data: {
        watchItemId: watchItem.id,
        price: currentPrice,
        score: intelligence.score,
        demandLabel: intelligence.demandLabel,
        soldQuantity: item.soldQuantity,
        visits: itemVisits,
      },
    });

    return NextResponse.json({
      ok: true,
      watchItem: {
        id: watchItem.id,
        mlItemId: watchItem.mlItemId,
        title: watchItem.title,
        currentPrice:
          watchItem.currentPrice == null
            ? null
            : Number(watchItem.currentPrice),
        score: watchItem.score,
        demandLabel: watchItem.demandLabel,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao monitorar anúncio.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  let extensionSession;
  try {
    extensionSession = await getExtensionSession(request);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao validar sessão da extensão.",
      },
      { status: 429 },
    );
  }

  if (!extensionSession) {
    return NextResponse.json(
      { error: "Sessão da extensão inválida ou expirada." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const itemId = (url.searchParams.get("itemId") ?? "").trim().toUpperCase();
  if (!/^MLBU?\d+$/.test(itemId)) {
    return NextResponse.json({ error: "Anúncio inválido." }, { status: 400 });
  }

  try {
    const session = extensionSession.ml;
    await prisma.radarWatchItem.updateMany({
      where: {
        sellerUserId: session.account.mercadoLivreUserId,
        mlItemId: itemId,
      },
      data: { active: false },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao remover monitoramento.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

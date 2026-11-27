import { momentumEligible, VALIDATED_COUNTER } from "@/lib/competitor-sales-velocity";
import { saveApiWatch } from "@/lib/api-watch-persistence";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getItemCurrentPrice,
  getItemsBulk,
  getItemsVisitTotals,
  getMlSession,
} from "@/lib/mercado-livre";
import { calculateRadarMomentum } from "@/lib/radar-momentum";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  itemId: z
    .string()
    .trim()
    .regex(/^MLB\d+$/i),
  referenceId: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Anúncio inválido." }, { status: 400 });
  }

  try {
    const session = await getMlSession();
    const itemId = parsed.data.itemId.toUpperCase();

    const [details, currentPrice, visits] = await Promise.all([
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
        { error: "Anúncio não encontrado no Mercado Livre." },
        { status: 404 },
      );
    }

    const price =
      currentPrice && currentPrice > 0
        ? currentPrice
        : item.currentPrice > 0
          ? item.currentPrice
          : null;
    const watchItem = await saveApiWatch({ sellerUserId: session.account.mercadoLivreUserId, workspaceId: session.account.workspaceId, item, price: price, visits: visits[item.id] ?? null, referenceId: parsed.data.referenceId });

    return NextResponse.json({
      ok: true,
      item: {
        mlItemId: watchItem.mlItemId,
        title: watchItem.title,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao adicionar ao monitoramento.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  try {
    const session = await getMlSession();
    const items = await prisma.radarWatchItem.findMany({
      where: {
        sellerUserId: session.account.mercadoLivreUserId,
        active: true,
      },
      orderBy: { updatedAt: "desc" },
      include: {
        snapshots: {
          orderBy: { capturedAt: "desc" },
          take: 24,
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
        momentum: calculateRadarMomentum(
          item.snapshots
            .filter(momentumEligible)
            .map((snapshot) => ({
              score: snapshot.score,
              demandLabel: snapshot.demandLabel,
              soldQuantity: snapshot.soldQuantity,
              visits: snapshot.visits,
              capturedAt: snapshot.capturedAt,
            })),
        ),
        snapshots: item.snapshots.map((snapshot) => ({
          price: snapshot.price == null ? null : Number(snapshot.price),
          score: snapshot.score,
          demandLabel: snapshot.demandLabel,
          soldQuantity: snapshot.soldKnown ? snapshot.soldQuantity : null,
          soldIsLowerBound: snapshot.soldIsLowerBound,
          trackingMode: snapshot.trackingMode === VALIDATED_COUNTER ? "API" : snapshot.trackingMode,
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

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const itemId = (url.searchParams.get("itemId") ?? "").trim().toUpperCase();

  if (!/^MLBU?\d+$/.test(itemId)) {
    return NextResponse.json({ error: "Anúncio inválido." }, { status: 400 });
  }

  try {
    const session = await getMlSession();
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

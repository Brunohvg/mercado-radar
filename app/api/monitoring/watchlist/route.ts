import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMlSession } from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

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
        soldQuantity: item.soldQuantity,
        visits: item.visits,
        lastCheckedAt: item.lastCheckedAt,
        createdAt: item.createdAt,
        snapshots: item.snapshots.map((snapshot) => ({
          price: snapshot.price == null ? null : Number(snapshot.price),
          score: snapshot.score,
          demandLabel: snapshot.demandLabel,
          soldQuantity: snapshot.soldQuantity,
          visits: snapshot.visits,
          capturedAt: snapshot.capturedAt,
        })),
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao carregar monitoramento.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const itemId = (url.searchParams.get("itemId") ?? "").trim().toUpperCase();

  if (!/^MLB\d+$/.test(itemId)) {
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
      error instanceof Error ? error.message : "Falha ao remover monitoramento.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

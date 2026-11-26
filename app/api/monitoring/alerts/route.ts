import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getMlSession } from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  ids: z.array(z.string().min(1)).max(100).optional(),
  all: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await getMlSession();
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1),
      100,
    );

    const [items, unreadCount] = await Promise.all([
      prisma.radarAlert.findMany({
        where: {
          sellerUserId: session.account.mercadoLivreUserId,
          ...(unreadOnly ? { readAt: null } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          watchItem: {
            select: {
              mlItemId: true,
              title: true,
              permalink: true,
              thumbnail: true,
            },
          },
        },
      }),
      prisma.radarAlert.count({
        where: {
          sellerUserId: session.account.mercadoLivreUserId,
          readAt: null,
        },
      }),
    ]);

    return NextResponse.json({
      unreadCount,
      alerts: items.map((alert) => ({
        id: alert.id,
        kind: alert.kind,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        metadata: alert.metadata,
        readAt: alert.readAt,
        createdAt: alert.createdAt,
        watchItem: alert.watchItem,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao carregar alertas.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success || (!parsed.data.all && !parsed.data.ids?.length)) {
    return NextResponse.json(
      { error: "Informe os alertas a marcar como lidos." },
      { status: 400 },
    );
  }

  try {
    const session = await getMlSession();
    const sellerUserId = session.account.mercadoLivreUserId;
    const readAt = new Date();

    const result = await prisma.radarAlert.updateMany({
      where: {
        sellerUserId,
        readAt: null,
        ...(parsed.data.all
          ? {}
          : { id: { in: parsed.data.ids ?? [] } }),
      },
      data: { readAt },
    });

    return NextResponse.json({ ok: true, updated: result.count, readAt });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao atualizar alertas.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

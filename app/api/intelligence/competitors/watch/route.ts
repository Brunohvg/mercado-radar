import { NextResponse } from "next/server";
import {
  intelligenceUser,
  intelligenceError,
  IntelligenceError,
} from "@/lib/intelligence-access";
import { itemIdSchema } from "@/lib/intelligence-validation";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMlAccount } from "@/lib/mercado-livre";
import { savePageWatch } from "@/lib/page-watchlist";

export async function POST(request: Request) {
  try {
    const user = await intelligenceUser();
    const id = itemIdSchema.safeParse(
      (await request.json().catch(() => null))?.itemId,
    );
    if (!id.success)
      throw new IntelligenceError("Anúncio inválido.", 400, "INVALID_INPUT");
    const [account, row] = await Promise.all([
      getWorkspaceMlAccount(user.workspaceId),
      prisma.marketItem.findUnique({
        where: {
          workspaceId_id: { workspaceId: user.workspaceId, id: id.data },
        },
      }),
    ]);
    if (!account)
      throw new IntelligenceError(
        "Conecte sua conta em Integrações para organizar o monitoramento.",
        409,
        "CONNECT_ACCOUNT",
      );
    if (!row)
      throw new IntelligenceError(
        "Esta leitura não está disponível na sua operação. Capture o anúncio com a extensão.",
        404,
        "NOT_FOUND",
      );
    const saved = await savePageWatch(
      account.mercadoLivreUserId,
      {
        id: row.id,
        title: row.title,
        price: row.lastPrice == null ? null : Number(row.lastPrice),
        soldLower: row.lastSoldLower,
        soldHasPlus: row.lastSoldUpper !== row.lastSoldLower,
        thumbnail: row.thumbnail,
        permalink: row.permalink,
      },
      true,
      row.lastSeenAt,
    );
    return NextResponse.json({
      ok: true,
      trackingMode: saved?.trackingMode,
      message:
        saved?.trackingMode === "API"
          ? "Monitoramento pela API preservado."
          : "Salvo. Atualiza quando a extensão capturar uma nova leitura deste anúncio.",
    });
  } catch (error) {
    return intelligenceError(error, "competitors/watch");
  }
}

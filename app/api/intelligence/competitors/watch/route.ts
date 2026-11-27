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
        include: { snapshots: { orderBy: { observedAt: "desc" }, take: 1 } },
      }),
    ]);
    if (!account)
      throw new IntelligenceError(
        "Conecte sua conta em Integrações para organizar o monitoramento.",
        409,
        "CONNECT_ACCOUNT",
      );
    if (!row || !row.snapshots.length)
      throw new IntelligenceError(
        "Esta leitura não está disponível na sua operação. Capture o anúncio com a extensão.",
        404,
        "NOT_FOUND",
      );
    const latest = row.snapshots[0];
    const lower = latest.soldExact ?? latest.soldLower;
    const saved = await savePageWatch(
      account.mercadoLivreUserId,
      {
        id: row.id,
        title: row.title,
        price: latest.price == null ? null : Number(latest.price),
        soldLower: lower,
        soldHasPlus: latest.soldExact == null && lower != null && latest.soldUpper !== lower,
        thumbnail: row.thumbnail,
        permalink: row.permalink,
      },
      true,
      latest.observedAt,
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

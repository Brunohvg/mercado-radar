import { getWorkspaceSettings } from "@/lib/workspace-settings";
import { NextResponse } from "next/server";
import { getExtensionSession } from "@/lib/extension-auth";

export async function GET(request: Request) {
  try {
    const session = await getExtensionSession(request);
    if (!session) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 },
      );
    }

    const settings = await getWorkspaceSettings(session.account.workspaceId);
    return NextResponse.json({
      authenticated: true,
      workspaceId: session.account.workspaceId,
      preferences: { taxPercent: settings.taxPercent == null ? null : Number(settings.taxPercent), operatingCost: Number(settings.operatingCostDefault), targetMarginPercent: Number(settings.targetMarginPercent), targetRoiPercent: Number(settings.targetRoiPercent), updatedAt: settings.updatedAt },
      account: {
        userId: session.account.mercadoLivreUserId,
        nickname: session.account.nickname,
      },
      access: {
        id: session.access.id,
        deviceId: session.access.deviceId,
        name: session.access.name,
        plan: session.account.workspace.plan,
        capabilities: session.access.capabilities,
        dailyRequestLimit: session.account.workspace.dailyRequestLimit,
        lastUsedAt: session.access.lastUsedAt,
        expiresAt: session.access.expiresAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        authenticated: false,
        error:
          error instanceof Error ? error.message : "Falha ao validar sessão.",
      },
      { status: 429 },
    );
  }
}

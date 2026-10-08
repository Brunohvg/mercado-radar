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

    return NextResponse.json({
      authenticated: true,
      account: {
        userId: session.account.mercadoLivreUserId,
        nickname: session.account.nickname,
      },
      access: {
        id: session.access.id,
        deviceId: session.access.deviceId,
        name: session.access.name,
        plan: session.access.plan,
        capabilities: session.access.capabilities,
        dailyRequestLimit: session.access.dailyRequestLimit,
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

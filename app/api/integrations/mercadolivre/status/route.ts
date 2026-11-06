import { getWorkspaceMlAccount } from "@/lib/mercado-livre";
import { getWorkspaceId } from "@/lib/workspace-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = Boolean(
    process.env.MERCADO_LIVRE_CLIENT_ID &&
      process.env.MERCADO_LIVRE_CLIENT_SECRET &&
      process.env.APP_ENCRYPTION_KEY,
  );

  try {
    const workspaceId = await getWorkspaceId();
    const account = await getWorkspaceMlAccount(workspaceId);

    return NextResponse.json({
      configured,
      connected: Boolean(account),
      nickname: account?.nickname ?? null,
      userId: account?.mercadoLivreUserId ?? null,
      tokenExpiresAt: account?.tokenExpiresAt?.toISOString() ?? null,
      scopes: account?.scope?.split(/\s+/).filter(Boolean) ?? [],
      publishingScopeAuthorized: Boolean(account?.scope?.split(/\s+/).includes("write")),
      publishingScopeNotice: account && !account.scope?.split(/\s+/).includes("write")
        ? "Reconecte a conta após habilitar Publicação e sincronização com leitura e escrita no DevCenter."
        : null,
    });
  } catch {
    return NextResponse.json({
      configured,
      connected: false,
      databaseAvailable: false,
    });
  }
}

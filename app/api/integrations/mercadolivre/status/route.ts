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
    const account = await prisma.mercadoLivreAccount.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      configured,
      connected: Boolean(account),
      nickname: account?.nickname ?? null,
      userId: account?.mercadoLivreUserId ?? null,
      tokenExpiresAt: account?.tokenExpiresAt?.toISOString() ?? null,
    });
  } catch {
    return NextResponse.json({
      configured,
      connected: false,
      databaseAvailable: false,
    });
  }
}

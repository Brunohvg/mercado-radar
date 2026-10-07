import { NextResponse } from "next/server";
import { z } from "zod";
import { refreshExtensionSession } from "@/lib/extension-auth";

const schema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(30),
  device_id: z.string().min(12).max(180),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Solicitação de renovação inválida." },
      { status: 400 },
    );
  }

  const session = await refreshExtensionSession({
    refreshToken: parsed.data.refresh_token,
    deviceId: parsed.data.device_id,
  });

  if (!session) {
    return NextResponse.json(
      { error: "Sessão da extensão expirada ou revogada." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    token_type: "Bearer",
    access_token: session.accessToken,
    expires_in: session.accessTokenExpiresIn,
    refresh_token: session.refreshToken,
    refresh_expires_in: session.refreshTokenExpiresIn,
    plan: session.plan,
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { exchangeExtensionAuthorizationCode } from "@/lib/extension-auth";

const schema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(20),
  code_verifier: z.string().min(30).max(180),
  redirect_uri: z.string().url(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Troca de código inválida." },
      { status: 400 },
    );
  }

  const session = await exchangeExtensionAuthorizationCode({
    code: parsed.data.code,
    codeVerifier: parsed.data.code_verifier,
    redirectUri: parsed.data.redirect_uri,
  });

  if (!session) {
    return NextResponse.json(
      { error: "Código expirado, já utilizado ou PKCE inválido." },
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

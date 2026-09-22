import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUrlSafe, sha256UrlSafe } from "@/lib/security";

export async function GET(request: Request) {
  const clientId = process.env.MERCADO_LIVRE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "MERCADO_LIVRE_CLIENT_ID não configurado." },
      { status: 503 },
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri =
    process.env.MERCADO_LIVRE_REDIRECT_URI ||
    `${origin}/api/integrations/mercadolivre/callback`;

  const state = randomUrlSafe(32);
  const verifier = randomUrlSafe(48);
  const challenge = sha256UrlSafe(verifier);

  const store = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60,
  };

  store.set("ml_oauth_state", state, cookieOptions);
  store.set("ml_pkce_verifier", verifier, cookieOptions);

  const authorizationUrl = new URL(
    "https://auth.mercadolivre.com.br/authorization",
  );
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(authorizationUrl);
}

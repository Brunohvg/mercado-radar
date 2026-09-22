import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  fetchCurrentUser,
  saveMlAccount,
} from "@/lib/mercado-livre";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get("ml_oauth_state")?.value;
  const verifier = store.get("ml_pkce_verifier")?.value;

  const redirect = (params: string) =>
    NextResponse.redirect(new URL(`/?${params}#integracoes`, origin));

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return redirect("ml_error=oauth_state");
  }

  try {
    const redirectUri =
      process.env.MERCADO_LIVRE_REDIRECT_URI ||
      `${origin}/api/integrations/mercadolivre/callback`;

    const token = await exchangeAuthorizationCode({
      code,
      redirectUri,
      codeVerifier: verifier,
    });

    const user = await fetchCurrentUser(token.access_token);

    await saveMlAccount({
      userId: String(user.id ?? token.user_id),
      nickname: user.nickname,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in,
      scope: token.scope,
    });

    store.delete("ml_oauth_state");
    store.delete("ml_pkce_verifier");

    return redirect("ml_connected=1");
  } catch (error) {
    console.error("Mercado Livre OAuth callback failed", error);
    return redirect("ml_error=oauth_callback");
  }
}

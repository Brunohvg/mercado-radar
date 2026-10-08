import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPublicOrigin } from "@/lib/public-url";
import {
  exchangeAuthorizationCode,
  fetchCurrentUser,
  saveMlAccount,
} from "@/lib/mercado-livre";
import { createExtensionAuthorizationCode } from "@/lib/extension-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getPublicOrigin(request);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get("ml_oauth_state")?.value;
  const verifier = store.get("ml_pkce_verifier")?.value;

  const extensionFlow = store.get("radar_extension_flow")?.value === "1";
  const extensionRedirectUri =
    store.get("radar_extension_redirect_uri")?.value ?? null;
  const extensionState =
    store.get("radar_extension_state")?.value ?? null;
  const extensionChallenge =
    store.get("radar_extension_code_challenge")?.value ?? null;
  const extensionDeviceId =
    store.get("radar_extension_device_id")?.value ?? null;
  const extensionDeviceName =
    store.get("radar_extension_device_name")?.value ?? "Chrome";

  const clearFlowCookies = () => {
    store.delete("ml_oauth_state");
    store.delete("ml_pkce_verifier");
    store.delete("radar_extension_flow");
    store.delete("radar_extension_redirect_uri");
    store.delete("radar_extension_state");
    store.delete("radar_extension_code_challenge");
    store.delete("radar_extension_device_id");
    store.delete("radar_extension_device_name");
  };

  const dashboardRedirect = (params: string) =>
    NextResponse.redirect(new URL(`/integracoes?${params}`, origin));

  const extensionErrorRedirect = (error: string) => {
    if (!extensionRedirectUri || !extensionState) {
      return dashboardRedirect(`ml_error=${encodeURIComponent(error)}`);
    }

    const redirect = new URL(extensionRedirectUri);
    redirect.searchParams.set("error", error);
    redirect.searchParams.set("state", extensionState);
    return NextResponse.redirect(redirect);
  };

  if (
    !code ||
    !state ||
    !expectedState ||
    state !== expectedState ||
    !verifier
  ) {
    clearFlowCookies();
    return extensionFlow
      ? extensionErrorRedirect("oauth_state")
      : dashboardRedirect("ml_error=oauth_state");
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

    const account = await saveMlAccount({
      userId: String(user.id ?? token.user_id),
      nickname: user.nickname,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in,
      scope: token.scope,
    });

    if (extensionFlow) {
      if (
        !extensionRedirectUri ||
        !extensionState ||
        !extensionChallenge ||
        !extensionDeviceId
      ) {
        clearFlowCookies();
        return extensionErrorRedirect("extension_state");
      }

      const extensionCode = await createExtensionAuthorizationCode({
        mercadoLivreAccountId: account.id,
        codeChallenge: extensionChallenge,
        redirectUri: extensionRedirectUri,
        deviceId: extensionDeviceId,
        deviceName: extensionDeviceName,
      });

      const redirect = new URL(extensionRedirectUri);
      redirect.searchParams.set("code", extensionCode);
      redirect.searchParams.set("state", extensionState);

      clearFlowCookies();
      return NextResponse.redirect(redirect);
    }

    clearFlowCookies();
    return dashboardRedirect("ml_connected=1");
  } catch (error) {
    console.error("Mercado Livre OAuth callback failed", error);
    clearFlowCookies();
    return extensionFlow
      ? extensionErrorRedirect("oauth_callback")
      : dashboardRedirect("ml_error=oauth_callback");
  }
}

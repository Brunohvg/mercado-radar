import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicOrigin } from "@/lib/public-url";
import { randomUrlSafe, sha256UrlSafe } from "@/lib/security";

const querySchema = z.object({
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(30).max(160),
  code_challenge_method: z.literal("S256"),
  state: z.string().min(16).max(180),
  device_id: z.string().min(12).max(180),
  device_name: z.string().trim().min(1).max(120).optional(),
});

function isAllowedChromeRedirect(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      /^[a-p]{32}\.chromiumapp\.org$/i.test(url.hostname) &&
      url.pathname.startsWith("/radar-auth")
    );
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    redirect_uri: url.searchParams.get("redirect_uri"),
    code_challenge: url.searchParams.get("code_challenge"),
    code_challenge_method: url.searchParams.get("code_challenge_method"),
    state: url.searchParams.get("state"),
    device_id: url.searchParams.get("device_id"),
    device_name: url.searchParams.get("device_name") ?? undefined,
  });

  if (!parsed.success || !isAllowedChromeRedirect(parsed.data.redirect_uri)) {
    return NextResponse.json(
      { error: "Solicitação de login da extensão inválida." },
      { status: 400 },
    );
  }

  const clientId = process.env.MERCADO_LIVRE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "MERCADO_LIVRE_CLIENT_ID não configurado." },
      { status: 503 },
    );
  }

  const origin = getPublicOrigin(request);
  const redirectUri =
    process.env.MERCADO_LIVRE_REDIRECT_URI ||
    `${origin}/api/integrations/mercadolivre/callback`;

  const mlState = randomUrlSafe(32);
  const mlVerifier = randomUrlSafe(48);
  const mlChallenge = sha256UrlSafe(mlVerifier);

  const store = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60,
  };

  store.set("ml_oauth_state", mlState, cookieOptions);
  store.set("ml_pkce_verifier", mlVerifier, cookieOptions);
  store.set("radar_extension_flow", "1", cookieOptions);
  store.set(
    "radar_extension_redirect_uri",
    parsed.data.redirect_uri,
    cookieOptions,
  );
  store.set("radar_extension_state", parsed.data.state, cookieOptions);
  store.set(
    "radar_extension_code_challenge",
    parsed.data.code_challenge,
    cookieOptions,
  );
  store.set("radar_extension_device_id", parsed.data.device_id, cookieOptions);
  store.set(
    "radar_extension_device_name",
    parsed.data.device_name ?? "Chrome",
    cookieOptions,
  );

  const authorizationUrl = new URL(
    "https://auth.mercadolivre.com.br/authorization",
  );
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", mlState);
  authorizationUrl.searchParams.set("code_challenge", mlChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(authorizationUrl);
}

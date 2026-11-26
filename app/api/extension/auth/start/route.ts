import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserSession } from "@/lib/workspace-auth";
import { getWorkspaceMlAccount } from "@/lib/mercado-livre";
import { createExtensionAuthorizationCode } from "@/lib/extension-auth";
import { getPublicOrigin } from "@/lib/public-url";

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
    return url.protocol === "https:" &&
      /^[a-p]{32}\.chromiumapp\.org$/i.test(url.hostname) &&
      url.pathname === "/radar-auth";
  } catch { return false; }
}

function extensionRedirect(uri: string, state: string, values: Record<string, string>) {
  const url = new URL(uri);
  url.searchParams.set("state", state);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
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
    return NextResponse.json({ error: "Solicitação de login da extensão inválida." }, { status: 400 });
  }

  const user = await getUserSession();
  if (!user) {
    const login = new URL("/login", getPublicOrigin(request));
    login.searchParams.set("next", url.pathname + url.search);
    return NextResponse.redirect(login, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    // The vendor already authorized Mercado Livre in Radar / Integrations.
    // A device login must not force a second ML OAuth flow.
    const account = await getWorkspaceMlAccount(user.workspaceId);
    if (!account) return extensionRedirect(parsed.data.redirect_uri, parsed.data.state, {
      error: "ml_account_required",
    });

    const code = await createExtensionAuthorizationCode({
      mercadoLivreAccountId: account.id,
      codeChallenge: parsed.data.code_challenge,
      redirectUri: parsed.data.redirect_uri,
      deviceId: parsed.data.device_id,
      deviceName: parsed.data.device_name ?? "Chrome",
    });
    return extensionRedirect(parsed.data.redirect_uri, parsed.data.state, { code });
  } catch (error) {
    console.error("[extension/auth/start] failed", error instanceof Error ? error.message : "unknown");
    return extensionRedirect(parsed.data.redirect_uri, parsed.data.state, {
      error: "server_unavailable",
    });
  }
}

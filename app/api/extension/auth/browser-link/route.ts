import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserSession } from "@/lib/workspace-auth";
import { getWorkspaceMlAccount } from "@/lib/mercado-livre";
import { createExtensionAuthorizationCode } from "@/lib/extension-auth";
import { getPublicOrigin } from "@/lib/public-url";

export const dynamic = "force-dynamic";
const schema = z.object({
  extensionId: z.string().regex(/^[a-p]{32}$/),
  redirectUri: z.string().url().max(200),
  state: z.string().min(16).max(180),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  deviceId: z.string().min(12).max(180),
});
export async function POST(request: Request) {
  const publicOrigin = new URL(getPublicOrigin(request)).origin;
  if (request.headers.get("origin") !== publicOrigin) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }
  const user = await getUserSession();
  if (!user) return NextResponse.json({ error: "Entre na sua conta Radar primeiro." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados de vinculação inválidos." }, { status: 400 });
  const { extensionId, redirectUri, codeChallenge, deviceId } = parsed.data;
  if (redirectUri !== "https://" + extensionId + ".chromiumapp.org/radar-auth") {
    return NextResponse.json({ error: "A extensão e o endereço de retorno não conferem." }, { status: 400 });
  }
  try {
    const account = await getWorkspaceMlAccount(user.workspaceId);
    if (!account) return NextResponse.json({
      error: "Conecte primeiro seu Mercado Livre na página Integrações do Radar.",
    }, { status: 409 });
    const code = await createExtensionAuthorizationCode({
      mercadoLivreAccountId: account.id,
      codeChallenge,
      redirectUri,
      deviceId,
      deviceName: "Chrome/Chromium",
    });
    return NextResponse.json({ code, state: parsed.data.state }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[extension/browser-link] error", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Não foi possível vincular a extensão." }, { status: 500 });
  }
}

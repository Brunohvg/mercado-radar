import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminAuthConfig,
  clearLoginFailures,
  clientIp,
  loginBlocked,
  registerLoginFailure,
  verifyAdminCredentials,
} from "@/lib/admin-auth";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  signAdminSession,
} from "@/lib/admin-token";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  const config = adminAuthConfig();

  if (!config.configured) {
    return NextResponse.json(
      {
        error:
          "Login não configurado. Defina ADMIN_EMAIL e ADMIN_PASSWORD_HASH (e, opcionalmente, ADMIN_SESSION_SECRET; sem ele usa APP_ENCRYPTION_KEY).",
      },
      { status: 503 },
    );
  }

  const ip = clientIp(request);

  if (loginBlocked(ip)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
      { status: 429 },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });
  }

  const ok = await verifyAdminCredentials(
    parsed.data.email,
    parsed.data.password,
  );

  if (!ok) {
    registerLoginFailure(ip);
    return NextResponse.json(
      { error: "E-mail ou senha inválidos." },
      { status: 401 },
    );
  }

  clearLoginFailures(ip);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, await signAdminSession(config.secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_SECONDS,
  });

  return response;
}

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
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS } from "@/lib/admin-token";
import { prisma } from "@/lib/prisma";
import { createUserSession, verifyPassword } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  const config = adminAuthConfig();

  const ip = clientIp(request);

  if (loginBlocked(ip)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
      { status: 429 },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe e-mail e senha." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  let user;
  let ok = false;
  try {
    user = await prisma.radarUser.findUnique({
      where: { email },
      include: { workspace: true },
    });
    if (config.configured && email === config.email) {
      ok = await verifyAdminCredentials(email, parsed.data.password);
      if (ok) {
        const workspace = await prisma.radarWorkspace.upsert({
          where: { id: "default" },
          update: {},
          create: {
            id: "default",
            name: "Minha operação",
            dailyRequestLimit: 5000,
          },
        });
        user = await prisma.radarUser.upsert({
          where: { email },
          update: { isOperator: true },
          create: { email, workspaceId: workspace.id, isOperator: true },
          include: { workspace: true },
        });
      }
    } else {
      // Do equivalent password work for unknown emails too.
      ok = await verifyPassword(
        parsed.data.password,
        user?.passwordHash ?? "scrypt:cHJpdmF0ZS1yYWRhcg:" + "AA".repeat(43),
      );
    }
    ok = ok && Boolean(user?.active && user.workspace.active);
  } catch (error) {
    console.error(
      "Login backend unavailable",
      (error as { code?: string }).code ?? "database_error",
    );
    return NextResponse.json(
      { error: "Não foi possível entrar agora. Tente novamente." },
      { status: 503 },
    );
  }

  if (!ok) {
    registerLoginFailure(ip);
    return NextResponse.json(
      { error: "E-mail ou senha inválidos." },
      { status: 401 },
    );
  }

  clearLoginFailures(ip);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, await createUserSession(user!.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_SECONDS,
  });

  return response;
}

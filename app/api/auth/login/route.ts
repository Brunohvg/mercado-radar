import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  adminAuthConfigured,
  clearLoginFailures,
  getLoginRateLimit,
  loginAttemptKey,
  registerLoginFailure,
  verifyAdminCredentials,
} from "@/lib/admin-auth";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
} from "@/lib/admin-session";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function POST(request: Request) {
  if (!adminAuthConfigured()) {
    return NextResponse.json(
      { error: "Login administrativo não configurado no ambiente." },
      { status: 503 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  let email = "";
  let password = "";
  let next = "/";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    email = String(body?.email ?? "");
    password = String(body?.password ?? "");
    next = safeNext(String(body?.next ?? "/"));
  } else {
    const body = await request.formData();
    email = String(body.get("email") ?? "");
    password = String(body.get("password") ?? "");
    next = safeNext(String(body.get("next") ?? "/"));
  }

  const key = loginAttemptKey(clientIp(request), email);
  const limit = getLoginRateLimit(key);

  if (limit.blocked) {
    const response = contentType.includes("application/json")
      ? NextResponse.json(
          { error: "Muitas tentativas. Tente novamente mais tarde." },
          { status: 429 },
        )
      : NextResponse.redirect(
          new URL(
            `/login?error=rate_limited&next=${encodeURIComponent(next)}`,
            request.url,
          ),
          303,
        );

    response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return response;
  }

  const valid = await verifyAdminCredentials({ email, password });

  if (!valid) {
    registerLoginFailure(key);
    return contentType.includes("application/json")
      ? NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 })
      : NextResponse.redirect(
          new URL(
            `/login?error=invalid_credentials&next=${encodeURIComponent(next)}`,
            request.url,
          ),
          303,
        );
  }

  const accounts = await prisma.mercadoLivreAccount.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 2,
  });

  if (accounts.length > 1) {
    return contentType.includes("application/json")
      ? NextResponse.json(
          {
            error:
              "Há mais de uma conta Mercado Livre conectada. Defina o contexto de conta antes de continuar.",
          },
          { status: 409 },
        )
      : NextResponse.redirect(
          new URL(
            `/login?error=multiple_accounts&next=${encodeURIComponent(next)}`,
            request.url,
          ),
          303,
        );
  }

  clearLoginFailures(key);

  const configuredEmail = process.env.ADMIN_EMAIL!.trim().toLowerCase();
  const token = createAdminSessionToken({
    email: configuredEmail,
    accountId: accounts[0]?.id ?? null,
  });

  const response = contentType.includes("application/json")
    ? NextResponse.json({ ok: true, next })
    : NextResponse.redirect(new URL(next, request.url), 303);

  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });

  return response;
}

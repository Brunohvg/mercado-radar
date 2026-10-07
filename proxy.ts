import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  adminSessionSecret,
  verifyAdminSession,
} from "@/lib/admin-token";

/**
 * Portão único do painel web (default-deny).
 *
 * Tudo exige a sessão do operador, EXCETO as rotas abaixo, que têm
 * autenticação própria ou precisam ser públicas por natureza:
 *  - /api/extension/**           Bearer por dispositivo (getExtensionSession)
 *  - /api/cron/**                RADAR_CRON_SECRET
 *  - /api/webhooks/mercadolivre  notificações do Mercado Livre
 *  - /api/integrations/mercadolivre/callback  retorno do OAuth
 *  - /api/health, /login, /api/auth/**
 *
 * Next 16 renomeou middleware.ts para proxy.ts. Se a sua versão ainda usar
 * middleware.ts, renomeie o arquivo e a função exportada para `middleware`.
 */
const PUBLIC = [
  "/login",
  "/api/auth",
  "/api/health",
  "/api/extension",
  "/api/cron",
  "/api/webhooks/mercadolivre",
  "/api/integrations/mercadolivre/callback",
];

function isPublic(pathname: string) {
  return PUBLIC.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const secret = adminSessionSecret();
  const configured =
    Boolean(process.env.ADMIN_EMAIL?.trim()) &&
    Boolean(process.env.ADMIN_PASSWORD_HASH?.trim()) &&
    secret.length >= 32;

  // Desenvolvimento sem credenciais: não trava o fluxo local.
  if (!configured && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (configured && (await verifyAdminSession(token, secret))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: configured
          ? "Não autorizado. Entre no Mercado Radar."
          : "Autenticação do painel não configurada.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|brand/|favicon.ico|icon.svg|manifest.webmanifest).*)",
  ],
};

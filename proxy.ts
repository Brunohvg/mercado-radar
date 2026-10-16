import { getPublicOrigin } from "@/lib/public-url";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-token";
import { getUserSession } from "@/lib/workspace-auth";

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

  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  try {
    if (await getUserSession(token ?? null)) {
      // Cookies alone do not authorize a cross-origin mutation.
      const origin = request.headers.get("origin");
      if (
        !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
        origin &&
        origin !== getPublicOrigin(request)
      ) {
        return NextResponse.json(
          { error: "Origem da solicitação inválida." },
          { status: 403 },
        );
      }
      const response = NextResponse.next();
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  } catch {
    return NextResponse.json(
      { error: "Serviço temporariamente indisponível. Tente novamente." },
      { status: 503 },
    );
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "Não autorizado. Entre no Mercado Radar.",
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
    "/((?!_next/static|_next/image|brand/|fonts/|favicon.ico|icon.svg|manifest.webmanifest).*)",
  ],
};

import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-session";

function isStatic(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/brand/") ||
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?|ttf|txt|xml)$/i.test(
      pathname,
    )
  );
}

function isPublic(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/extension/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/integrations/mercadolivre/authorize" ||
    pathname === "/api/integrations/mercadolivre/callback" ||
    pathname === "/api/webhooks/mercadolivre" ||
    isStatic(pathname)
  );
}

function unauthorizedApi() {
  return NextResponse.json(
    { error: "Sessão administrativa necessária." },
    { status: 401 },
  );
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isPublic(pathname)) {
    if (pathname === "/login") {
      const session = verifyAdminSessionToken(
        request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
      );
      if (session) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }

    return NextResponse.next();
  }

  const session = verifyAdminSessionToken(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return unauthorizedApi();
    }

    const login = new URL("/login", request.url);
    login.searchParams.set(
      "next",
      pathname + request.nextUrl.search,
    );
    login.searchParams.set("error", "session_required");
    return NextResponse.redirect(login);
  }

  const headers = new Headers(request.headers);
  headers.delete("x-radar-account-id");
  headers.delete("x-radar-admin-email");

  headers.set("x-radar-admin-email", session.email);
  if (session.accountId) {
    headers.set("x-radar-account-id", session.accountId);
  }

  return NextResponse.next({
    request: { headers },
  });
}

export const config = {
  matcher: ["/:path*"],
};

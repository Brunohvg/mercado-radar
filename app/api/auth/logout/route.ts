import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-token";
import { revokeUserSession } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await revokeUserSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

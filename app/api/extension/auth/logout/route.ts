import { NextResponse } from "next/server";
import { revokeExtensionSession } from "@/lib/extension-auth";

export async function POST(request: Request) {
  const revoked = await revokeExtensionSession(request);
  return NextResponse.json({ ok: revoked });
}

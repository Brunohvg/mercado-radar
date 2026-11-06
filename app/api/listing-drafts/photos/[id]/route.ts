import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";
const STORAGE = process.env.RADAR_UPLOAD_DIR || "/app/uploads";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let workspaceId: string;
  try { workspaceId = (await requireUser()).workspaceId; }
  catch { return new NextResponse(null, { status: 401 }); }
  const { id } = await params;
  const match = /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(jpg|png|webp)$/.exec(id);
  if (!match) return new NextResponse(null, { status: 404 });
  try {
    const bytes = await readFile(path.join(STORAGE, workspaceId, id));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": match[2] === "jpg" ? "image/jpeg" : match[2] === "png" ? "image/png" : "image/webp",
        "Cache-Control": "private, max-age=120",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

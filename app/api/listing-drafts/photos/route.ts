import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";
const STORAGE = process.env.RADAR_UPLOAD_DIR || "/app/uploads";
const MAX_BYTES = 7 * 1024 * 1024;

function imageExtension(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP") return "webp";
  return null;
}

export async function POST(request: Request) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "Entre no Radar para enviar imagens." }, { status: 401 }); }

  try {
    const body = await request.formData();
    const file = body.get("file");
    if (!(file instanceof File) || file.size < 100 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Selecione uma imagem JPG, PNG ou WebP com até 7 MB." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = imageExtension(bytes);
    if (!ext) return NextResponse.json({ error: "O arquivo não é uma imagem JPG, PNG ou WebP válida." }, { status: 400 });
    const folder = path.join(STORAGE, user.workspaceId);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const id = randomUUID() + "." + ext;
    await writeFile(path.join(folder, id), bytes, { flag: "wx", mode: 0o600 });
    return NextResponse.json({
      url: "/api/listing-drafts/photos/" + id,
      name: file.name.slice(0, 120),
      bytes: bytes.length,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[listing-photo-upload] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Falha ao enviar foto. Verifique o volume do Coolify." }, { status: 500 });
  }
}

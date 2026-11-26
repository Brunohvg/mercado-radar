import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { requireUser } from "@/lib/workspace-auth";
import { extractPhotoFacts, GeminiRequestError } from "@/lib/ai/gemini-listing";

export const dynamic = "force-dynamic";
const STORAGE = process.env.RADAR_UPLOAD_DIR || "/app/uploads";
const schema = z.object({
  photoUrl: z.string().regex(/^\/api\/listing-drafts\/photos\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/),
  name: z.string().trim().min(3).max(180),
});
export async function POST(request: Request) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "Entre no Radar para analisar uma foto." }, { status: 401 }); }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Selecione uma foto enviada pelo Radar." }, { status: 400 });
  const id = parsed.data.photoUrl.split("/").at(-1)!;
  const ext = id.split(".").at(-1);
  const mime = ext === "jpg" ? "image/jpeg" as const : ext === "png" ? "image/png" as const : "image/webp" as const;
  try {
    // Files are isolated per workspace; do not fetch user-controlled remote URLs.
    const bytes = await readFile(path.join(STORAGE, user.workspaceId, id));
    if (bytes.length > 7 * 1024 * 1024) return NextResponse.json({ error: "Imagem muito grande." }, { status: 413 });
    const facts = await extractPhotoFacts({ bytes, mimeType: mime, productName: parsed.data.name });
    return NextResponse.json({
      ...facts, source: "AI_IMAGE_UNVERIFIED", requiresSellerConfirmation: true,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof GeminiRequestError ? error.status : 502;
    return NextResponse.json({
      error: error instanceof GeminiRequestError ? error.message : "Foto não disponível ou análise de imagem indisponível.",
    }, { status });
  }
}

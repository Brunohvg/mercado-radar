import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/workspace-auth";
import { generateListingCopy, geminiIsConfigured } from "@/lib/ai/gemini-listing";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  name: z.string().trim().min(3).max(180),
  brand: z.string().trim().max(90).optional(),
  category: z.string().trim().max(180).optional(),
  confirmedFacts: z.string().trim().max(1500).optional(),
});

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Entre no Radar para usar o assistente de IA." }, { status: 401 });
  }
  if (!geminiIsConfigured()) {
    return NextResponse.json({
      error: "IA desativada. Configure RADAR_AI_PROVIDER=gemini e GEMINI_API_KEY no Coolify.",
    }, { status: 503 });
  }
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Dados do produto inválidos." }, { status: 400 });
  }
  try {
    const copy = await generateListingCopy(input.data);
    return NextResponse.json({
      provider: "gemini",
      source: "AI_SUGGESTION",
      requiresReview: true,
      ...copy,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar o texto do anúncio.";
    // No upstream error body, request headers, user content or API secret is surfaced.
    const status = message.includes("Cota") ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

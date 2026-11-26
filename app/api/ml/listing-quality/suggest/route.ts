import { NextResponse } from "next/server";
import { z } from "zod";
import { pilotSession } from "@/lib/pilot/actions";
import { loadListingQuality } from "@/lib/listing-quality-load";
import { checkSuggestedTitle } from "@/lib/listing-quality";
import { generateListingImprovement, geminiConfiguration, geminiIsConfigured, GeminiRequestError } from "@/lib/ai/gemini-listing";

export const dynamic = "force-dynamic";

const schema = z.object({ mlItemId: z.string().regex(/^MLB\d{5,}$/) });

// Só sugere: nada vai para o Mercado Livre daqui. Os fatos são relidos no servidor.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Anúncio inválido." }, { status: 400 });
  let s;
  try { s = await pilotSession(); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sessão inválida." }, { status: 401 });
  }
  if (!geminiIsConfigured()) return NextResponse.json({ error: geminiConfiguration().message, code: "NOT_CONFIGURED" }, { status: 503 });
  try {
    const data = await loadListingQuality(s, parsed.data.mlItemId);
    if (!data) return NextResponse.json({ error: "Anúncio não encontrado nesta conta." }, { status: 404 });
    const facts = data.item.attributes.filter((a) => a.value).map((a) => `${a.name}: ${a.value}`);
    const out = await generateListingImprovement({
      title: data.item.title,
      category: data.item.categoryName,
      facts,
      description: data.item.description,
      competitorTerms: data.diagnosis.competitorTerms,
      competitorTitles: data.competitorTitles,
    });
    const notes = [...out.notes];
    const check = checkSuggestedTitle(out.title, [data.item.title, ...facts]);
    let title: string | null = null;
    if (check.ok) title = check.title === data.item.title ? null : check.title;
    else notes.unshift(`Título da IA descartado: ${check.reason}`);
    const description = out.description.replace(/<[^>]+>/g, "").replace(/\b(?:https?:\/\/|www\.)\S+/gi, "").trim();
    return NextResponse.json({ title, description, notes, source: "AI_SUGGESTION", requiresReview: true });
  } catch (e) {
    const status = e instanceof GeminiRequestError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível gerar a sugestão." }, { status });
  }
}

import { NextResponse } from "next/server";
import { getItemFullDetails, getItemQuestions } from "@/lib/mercado-livre";
import { getGeminiModel, geminiIsConfigured, requestGemini } from "@/lib/ai/gemini-listing";
import { prisma } from "@/lib/prisma";
import { answerProblems, buildAnswerPrompt } from "@/lib/pilot/guards";
import { ownedUnansweredQuestion, pilotSession } from "@/lib/pilot/actions";

export const dynamic = "force-dynamic";

// Rascunho da IA. Não publica nada: o vendedor revisa e confirma em /answer.
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let s;
  try { s = await pilotSession(); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sessão inválida." }, { status: 401 });
  }
  if (!geminiIsConfigured())
    return NextResponse.json({ error: "IA não configurada nesta instalação. Escreva a resposta e envie." }, { status: 503 });
  try {
    const owned = await ownedUnansweredQuestion(s.ml.accessToken, s.sellerId, id);
    if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });
    const itemId = String(owned.question.item_id ?? "");
    const [item, history, product] = await Promise.all([
      getItemFullDetails({ accessToken: s.ml.accessToken, itemId }).catch(() => null),
      getItemQuestions({ accessToken: s.ml.accessToken, itemId, limit: 20 }).catch(() => null),
      prisma.mercadoLivreProduct.findFirst({ where: { mlItemId: itemId, sellerUserId: s.sellerId } }),
    ]);
    const prompt = buildAnswerPrompt({
      question: String(owned.question.text ?? ""),
      title: item?.title ?? product?.title ?? itemId,
      price: product?.currentPrice == null ? null : Number(product.currentPrice),
      stock: product?.availableQuantity ?? null,
      attributes: (item?.attributes ?? [])
        .filter((a) => a.name && a.value_name)
        .map((a) => ({ name: String(a.name), value: String(a.value_name) })),
      previous: (history?.questions ?? [])
        .filter((q) => q.text && q.answer?.text)
        .map((q) => ({ question: String(q.text), answer: String(q.answer!.text) })),
    });
    const payload = (await requestGemini(
      "https://generativelanguage.googleapis.com/v1beta/models/" + getGeminiModel() + ":generateContent",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY!.trim() },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.2 },
        }),
      },
      20000,
    )) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const draft = (payload?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim().slice(0, 2000);
    if (!draft) return NextResponse.json({ error: "A IA não devolveu texto. Escreva a resposta e envie." }, { status: 502 });
    return NextResponse.json({ draft, problems: answerProblems(draft), itemId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível gerar o rascunho." }, { status: 502 });
  }
}

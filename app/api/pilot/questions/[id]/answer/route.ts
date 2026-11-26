import { NextResponse } from "next/server";
import { z } from "zod";
import { answerQuestion } from "@/lib/mercado-livre";
import { answerProblems } from "@/lib/pilot/guards";
import { logPilotAction, ownedUnansweredQuestion, pilotSession } from "@/lib/pilot/actions";

export const dynamic = "force-dynamic";

const schema = z.object({ text: z.string().max(2000), confirm: z.literal(true) });

// ESCRITA: publica a resposta. Exige confirm=true vindo do clique do vendedor.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirme a resposta antes de enviar." }, { status: 400 });
  const text = parsed.data.text.trim();
  const problems = answerProblems(text);
  if (problems.length) return NextResponse.json({ error: problems.join(" "), problems }, { status: 422 });
  let s;
  try { s = await pilotSession(); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sessão inválida." }, { status: 401 });
  }
  try {
    const owned = await ownedUnansweredQuestion(s.ml.accessToken, s.sellerId, id);
    if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });
    const itemId = String(owned.question.item_id ?? "");
    const base = { workspaceId: s.workspaceId, userId: s.user.id, sellerId: s.sellerId, kind: "ANSWER_QUESTION" as const, mlItemId: itemId, targetId: id, before: { question: owned.question.text } };
    try {
      await answerQuestion({ accessToken: s.ml.accessToken, questionId: id, text });
    } catch (e) {
      const message = e instanceof Error ? e.message : "O Mercado Livre recusou a resposta.";
      await logPilotAction({ ...base, after: { text }, status: "FAILED", error: message });
      return NextResponse.json({ error: message }, { status: 502 });
    }
    await logPilotAction({ ...base, after: { text }, status: "DONE" });
    return NextResponse.json({ ok: true, questionId: id, itemId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível responder." }, { status: 502 });
  }
}

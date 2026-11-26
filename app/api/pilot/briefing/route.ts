import { NextResponse } from "next/server";
import { getMlSession, getUnansweredQuestions } from "@/lib/mercado-livre";
import { buildBriefing } from "@/lib/pilot/briefing";
import { loadPilotData, PILOT_DAYS } from "@/lib/pilot/load";

export const dynamic = "force-dynamic";

// Briefing do Piloto. Só leitura: nada aqui altera anúncios.
export async function GET() {
  let session;
  try {
    session = await getMlSession();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Conecte o Mercado Livre em Integrações." },
      { status: 409 },
    );
  }
  const seller = session.account.mercadoLivreUserId;
  const [data, questions] = await Promise.all([
    loadPilotData({ workspaceId: session.account.workspaceId, sellerId: seller }),
    getUnansweredQuestions({ accessToken: session.accessToken, sellerId: seller, limit: 20 })
      .then((rows) => ({ rows, ok: true }))
      .catch(() => ({ rows: [], ok: false })),
  ]);
  const briefing = buildBriefing({ ...data, questions: questions.rows, days: PILOT_DAYS });
  if (!questions.ok) briefing.assumptions.push("Não consegui ler as perguntas agora; elas ficam fora deste briefing.");
  return NextResponse.json(
    { ...briefing, days: PILOT_DAYS, historyComplete: data.historyComplete, syncedAt: data.syncedAt },
    { headers: { "cache-control": "private, no-store" } },
  );
}

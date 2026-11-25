import { prisma } from "@/lib/prisma";
import { getMlSession, getQuestion, MlApiError } from "@/lib/mercado-livre";
import { requireUser } from "@/lib/workspace-auth";

/** Sessão do vendedor para uma ação do Piloto (usuário logado + conta ML). */
export async function pilotSession() {
  const user = await requireUser();
  const ml = await getMlSession();
  return { user, ml, sellerId: ml.account.mercadoLivreUserId, workspaceId: ml.account.workspaceId };
}

/** A pergunta precisa ser deste vendedor e estar sem resposta. */
export async function ownedUnansweredQuestion(accessToken: string, sellerId: string, questionId: string) {
  if (!/^\d{1,20}$/.test(questionId)) return { error: "Pergunta inválida.", status: 400 } as const;
  const question = await getQuestion({ accessToken, questionId }).catch((e) => {
    if (e instanceof MlApiError && e.status === 404) return null;
    throw e;
  });
  if (!question || String(question.seller_id ?? "") !== sellerId)
    return { error: "Pergunta não encontrada nesta conta.", status: 404 } as const;
  if (question.status && question.status !== "UNANSWERED")
    return { error: "Essa pergunta já foi respondida ou removida.", status: 409 } as const;
  return { question } as const;
}

export async function logPilotAction(entry: {
  workspaceId: string;
  userId: string;
  sellerId: string;
  kind: "ANSWER_QUESTION" | "UPDATE_PRICE" | "EDIT_LISTING" | "JOIN_PROMOTION";
  mlItemId: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  status: "DONE" | "FAILED";
  error?: string;
}) {
  await prisma.pilotActionLog.create({
    data: {
      ...entry,
      before: entry.before === undefined ? undefined : (entry.before as object),
      after: entry.after === undefined ? undefined : (entry.after as object),
    },
  });
}

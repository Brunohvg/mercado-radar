import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/workspace-auth";
import { prisma } from "@/lib/prisma";
import { MlApiError } from "@/lib/mercado-livre";

export const intelligenceEnabled = () =>
  process.env.RADAR_INTELLIGENCE_ENABLED === "1";
export class IntelligenceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}
export async function intelligenceUser() {
  const user = await getUserSession();
  if (!user)
    throw new IntelligenceError(
      "Entre novamente no Mercado Radar.",
      401,
      "SESSION_REQUIRED",
    );
  if (!intelligenceEnabled())
    throw new IntelligenceError(
      "Módulo ainda não habilitado nesta instalação.",
      404,
      "FEATURE_DISABLED",
    );
  return user;
}
export async function consumeIntelligenceRequest(
  workspaceId: string,
  limit: number,
) {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  if (limit <= 0)
    throw new IntelligenceError(
      "Limite de consultas atingido. Consulte as configurações da operação.",
      429,
      "QUOTA",
    );
  const used = await prisma.$queryRaw<Array<{ requests: number }>>`
    INSERT INTO "RadarWorkspaceUsage" ("workspaceId", "day", "requests") VALUES (${workspaceId}, ${day}::date, 1)
    ON CONFLICT ("workspaceId", "day") DO UPDATE SET "requests" = "RadarWorkspaceUsage"."requests" + 1
    WHERE "RadarWorkspaceUsage"."requests" < ${limit} RETURNING "requests"
  `;
  if (!used.length)
    throw new IntelligenceError(
      "Limite de consultas atingido. Aguarde a renovação diária ou revise seu plano.",
      429,
      "QUOTA",
    );
}
export function intelligenceError(error: unknown, scope: string) {
  const status =
    error instanceof IntelligenceError
      ? error.status
      : error instanceof MlApiError
        ? error.status === 401
          ? 502
          : error.status || 504
        : 500;
  const code =
    error instanceof IntelligenceError || error instanceof MlApiError
      ? error.code
      : "INTERNAL";
  console.error(
    JSON.stringify({
      scope,
      code,
      status,
      event: "intelligence_request_failed",
    }),
  );
  return NextResponse.json(
    {
      error:
        error instanceof IntelligenceError || error instanceof MlApiError
          ? error.message
          : "Não foi possível concluir. Tente novamente em instantes.",
      code,
    },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

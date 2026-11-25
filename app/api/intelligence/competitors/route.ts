import { NextResponse } from "next/server";
import { z } from "zod";
import {
  intelligenceUser,
  intelligenceError,
  IntelligenceError,
  consumeIntelligenceRequest,
} from "@/lib/intelligence-access";
import { parseCompetitorQuery } from "@/lib/competitor-analysis";
import { researchCompetitors } from "@/lib/competitor-research";

export const dynamic = "force-dynamic";
const querySchema = z.object({
  q: z.string().trim().min(2).max(240),
  category: z
    .string()
    .regex(/^MLB\d+$/)
    .optional(),
  offset: z.coerce.number().int().min(0).max(180).default(0),
});
export async function GET(request: Request) {
  try {
    const user = await intelligenceUser();
    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success)
      throw new IntelligenceError(
        "Revise a busca, a categoria MLB e a página solicitada.",
        400,
        "INVALID_INPUT",
      );
    try {
      parseCompetitorQuery(parsed.data.q);
    } catch (error) {
      throw new IntelligenceError(
        (error as Error).message,
        400,
        "INVALID_INPUT",
      );
    }
    await consumeIntelligenceRequest(
      user.workspaceId,
      user.workspace.dailyRequestLimit,
    );
    const result = await researchCompetitors({
      workspaceId: user.workspaceId,
      query: parsed.data.q,
      categoryId: parsed.data.category,
      offset: parsed.data.offset,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return intelligenceError(error, "competitors");
  }
}

import { NextResponse } from "next/server";
import {
  intelligenceUser,
  intelligenceError,
  IntelligenceError,
  consumeIntelligenceRequest,
} from "@/lib/intelligence-access";
import { kitQuoteSchema } from "@/lib/intelligence-validation";
import { quoteKit } from "@/lib/kit-quotes";
export async function POST(request: Request) {
  try {
    const user = await intelligenceUser();
    const parsed = kitQuoteSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      throw new IntelligenceError(
        "Informe preço, categoria, modalidade e pacote válido quando houver frete.",
        400,
        "INVALID_INPUT",
      );
    await consumeIntelligenceRequest(
      user.workspaceId,
      user.workspace.dailyRequestLimit,
    );
    return NextResponse.json(await quoteKit(user.workspaceId, parsed.data), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return intelligenceError(error, "kits/quote");
  }
}

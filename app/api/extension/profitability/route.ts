import { NextResponse } from "next/server";
import { getExtensionSession } from "@/lib/extension-auth";
import { profitabilitySchema, runProfitability } from "@/lib/profitability-request";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let extensionSession;
  try {
    extensionSession = await getExtensionSession(request);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao validar sessão da extensão.",
      },
      { status: 429 },
    );
  }

  if (!extensionSession) {
    return NextResponse.json(
      { error: "Sessão da extensão inválida ou expirada." },
      { status: 401 },
    );
  }

  const parsed = profitabilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  return runProfitability(extensionSession.ml, parsed);
}

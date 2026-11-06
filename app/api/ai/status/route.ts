import { NextResponse } from "next/server";
import { requireUser } from "@/lib/workspace-auth";
import {
  GeminiRequestError,
  geminiConfiguration,
  geminiIsConfigured,
  probeGeminiConnection,
} from "@/lib/ai/gemini-listing";

export const dynamic = "force-dynamic";

async function authorize() {
  try {
    await requireUser();
    return true;
  } catch {
    return false;
  }
}

/** Status local da configuração, sem fazer chamadas externas nem expor segredos. */
export async function GET() {
  if (!(await authorize())) {
    return NextResponse.json({ error: "Entre no Radar." }, { status: 401 });
  }
  return NextResponse.json(geminiConfiguration(), {
    headers: { "cache-control": "no-store" },
  });
}

/** Teste explícito de chave/modelo: não gera anúncios e não publica produtos. */
export async function POST() {
  if (!(await authorize())) {
    return NextResponse.json({ error: "Entre no Radar." }, { status: 401 });
  }
  if (!geminiIsConfigured()) {
    return NextResponse.json(
      { error: geminiConfiguration().message, code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  try {
    const result = await probeGeminiConnection();
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof GeminiRequestError ? error.status : 502;
    const code = error instanceof GeminiRequestError ? error.code : "UNKNOWN";
    console.warn("[Radar IA] Diagnóstico:", code, status);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Teste da IA indisponível.",
      code,
    }, { status });
  }
}

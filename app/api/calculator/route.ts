import { NextResponse } from "next/server";
import { getMlSession } from "@/lib/mercado-livre";
import { profitabilitySchema, runProfitability } from "@/lib/profitability-request";

export const dynamic = "force-dynamic";

// Mesma calculadora da extensão, autenticada pela sessão do site.
export async function POST(request: Request) {
  const parsed = profitabilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  let session;
  try {
    session = await getMlSession();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Conecte o Mercado Livre em Integrações." },
      { status: 409 },
    );
  }
  return runProfitability(session, parsed);
}

import { NextResponse } from "next/server";
import { analyzeProfitability } from "@/lib/profitability";
import { analysisSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const payload = analysisSchema.parse(await request.json());
    const analysis = analyzeProfitability(payload);
    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dados inválidos";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { sourcingUser, sourcingError, SourcingError, noStore } from "@/lib/sourcing/service";
import { lookupCnpj, CnpjLookupError } from "@/lib/sourcing/cnpj";

export const dynamic = "force-dynamic";

// Preenche o cadastro a partir do CNPJ (dados abertos da Receita via BrasilAPI). Só leitura.
export async function GET(request: Request) {
  try {
    await sourcingUser();
    const cnpj = new URL(request.url).searchParams.get("cnpj") ?? "";
    try {
      return NextResponse.json({ check: await lookupCnpj(cnpj) }, noStore);
    } catch (error) {
      if (error instanceof CnpjLookupError)
        throw new SourcingError(error.message, error.code === "UNAVAILABLE" ? 503 : error.code === "NOT_FOUND" ? 404 : 400, error.code);
      throw error;
    }
  } catch (error) {
    return sourcingError(error, "cnpj/lookup");
  }
}

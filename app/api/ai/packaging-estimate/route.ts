import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/workspace-auth";
import { getCatalogProductDetails, getMlSession } from "@/lib/mercado-livre";
import { generatePackagingEstimate, geminiConfiguration, geminiIsConfigured, GeminiRequestError } from "@/lib/ai/gemini-listing";

export const dynamic = "force-dynamic";
const schema = z.object({
  name: z.string().trim().min(5).max(180),
  brand: z.string().trim().max(90).optional(),
  category: z.string().trim().max(180).optional(),
  catalogProductId: z.string().regex(/^MLB\d+$/).optional(),
});

export async function POST(request: Request) {
  try { await requireUser(); }
  catch { return NextResponse.json({ error: "Entre no Radar para usar o assistente." }, { status: 401 }); }
  if (!geminiIsConfigured()) return NextResponse.json({
    error: geminiConfiguration().message, code: "NOT_CONFIGURED",
  }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe um produto identificado." }, { status: 400 });
  const input = parsed.data;
  try {
    const verifiedFacts: string[] = [];
    let verifiedName = input.name;
    if (input.catalogProductId) {
      try {
        const session = await getMlSession();
        const details = await getCatalogProductDetails({
          accessToken: session.accessToken, productId: input.catalogProductId,
        });
        if (details.id === input.catalogProductId && details.name) {
          verifiedName = details.name;
          for (const fact of (details.attributes ?? []).slice(0, 30)) {
            if (fact.name && fact.value_name && !/sku|ean|gtin|identificador/i.test(fact.name))
              verifiedFacts.push(String(fact.name).slice(0, 65) + ": " + String(fact.value_name).slice(0, 95));
          }
        }
      } catch {
        // Do not turn an upstream failure into invented verified facts.
      }
    }
    const result = await generatePackagingEstimate({
      name: verifiedName, brand: input.brand, category: input.category, verifiedFacts,
    });
    return NextResponse.json({
      ...result,
      source: "AI_ESTIMATE",
      confidence: "LOW",
      requiresSellerConfirmation: true,
      verifiedFactsCount: verifiedFacts.length,
      forSimulationOnly: true,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Não foi possível estimar embalagem.",
      code: error instanceof GeminiRequestError ? error.code : "AI_ERROR",
    }, { status: error instanceof GeminiRequestError ? error.status : 502 });
  }
}

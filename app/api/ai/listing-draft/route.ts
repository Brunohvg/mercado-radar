import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/workspace-auth";
import { getCatalogProductDetails, getMlSession } from "@/lib/mercado-livre";
import { generateListingCopy, geminiIsConfigured, geminiConfiguration, GeminiRequestError } from "@/lib/ai/gemini-listing";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  name: z.string().trim().min(3).max(180),
  brand: z.string().trim().max(90).optional(),
  category: z.string().trim().max(180).optional(),
  confirmedFacts: z.string().trim().max(1500).optional(),
  catalogProductId: z.string().trim().max(50).optional(),
});

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Entre no Radar para usar o assistente de IA." }, { status: 401 });
  }
  if (!geminiIsConfigured()) {
    return NextResponse.json({
      error: geminiConfiguration().message,
      code: "NOT_CONFIGURED",
    }, { status: 503 });
  }
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Dados do produto inválidos." }, { status: 400 });
  }
  // Never call the model with only a barcode: that produces fake names and attributes.
  if (/^\d{8,14}$/.test(input.data.name.replace(/\D/g, ""))) {
    return NextResponse.json({
      error: "O EAN sozinho não identifica o produto. Confirme o nome comercial antes de gerar o anúncio.",
      code: "PRODUCT_IDENTITY_REQUIRED",
    }, { status: 422 });
  }
  try {
    const supplied = input.data;
    let verifiedFacts: string[] = [];
    let verifiedName: string | undefined;
    if (supplied.catalogProductId) {
      // Re-fetch product attributes server-side. Ignore client-provided technical claims.
      try {
        const session = await getMlSession();
        const details = await getCatalogProductDetails({
          accessToken: session.accessToken,
          productId: supplied.catalogProductId,
        });
        if (details.id === supplied.catalogProductId && details.name) {
          verifiedName = details.name.slice(0, 180);
          verifiedFacts = (details.attributes ?? [])
            .filter((a) => a.name && a.value_name &&
              !/identificador|código interno|sku|ean|gtin/i.test(a.name))
            .slice(0, 18)
            .map(a => String(a.name).slice(0, 65) + ": " + String(a.value_name).slice(0, 120));
        }
      } catch {
        // Catalog may be temporarily unavailable. Never present guessed facts.
      }
    }
    const copy = await generateListingCopy({
      ...supplied,
      name: verifiedName ?? supplied.name,
      verifiedFacts,
    });
    return NextResponse.json({
      provider: "gemini",
      source: "AI_SUGGESTION",
      requiresReview: true,
      verifiedFactsCount: verifiedFacts.length,
      verifiedSource: verifiedName ? "MERCADO_LIVRE_CATALOG" : null,
      ...copy,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar o texto do anúncio.";
    // Códigos estáveis ajudam o suporte; nenhum corpo upstream ou segredo é exposto.
    const status = error instanceof GeminiRequestError ? error.status : 502;
    const code = error instanceof GeminiRequestError ? error.code : "UNKNOWN";
    console.warn("[Radar IA] Falha na geração:", code, status);
    return NextResponse.json({ error: message, code }, { status });
  }
}

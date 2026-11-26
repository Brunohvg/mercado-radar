import { NextResponse } from "next/server";
import { z } from "zod";
import { getExtensionSession } from "@/lib/extension-auth";
import { getMarketInsights, recordObservations } from "@/lib/market-intel";
import { observationSchema } from "@/lib/extension-observation";

export const dynamic = "force-dynamic";

/**
 * A extensão envia o que a página do Mercado Livre aberta pelo usuário mostra
 * (busca ou anúncio). O Radar guarda a leitura e devolve as estimativas
 * calculadas com o histórico. Nenhuma chamada à API do Mercado Livre aqui.
 */
const schema = z.object({
  page: z.enum(["search", "product"]),
  query: z.string().trim().nullable().optional(),
  items: z.array(z.unknown()).min(1).max(60),
});

export async function POST(request: Request) {
  let session;
  try {
    session = await getExtensionSession(request);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Limite da extensão atingido.",
      },
      { status: 429 },
    );
  }

  if (!session) {
    return NextResponse.json(
      { error: "Sessão da extensão inválida ou expirada." },
      { status: 401 },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A página não forneceu anúncios válidos.", items: [] },
      { status: 400 },
    );
  }

  try {
    const { page, items: rawItems } = parsed.data;
    const query = parsed.data.query?.slice(0, 180) ?? null;
    const items = rawItems.flatMap((entry) => {
      const result = observationSchema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
    if (!items.length) {
      return NextResponse.json(
        { error: "A página não forneceu anúncios válidos.", items: [] },
        { status: 400 },
      );
    }
    const listings = items.map((item) => ({
      ...item,
      id: item.id.toUpperCase(),
      catalogProductId: item.catalogProductId?.toUpperCase() ?? null,
    }));

    await recordObservations({
      workspaceId: session.account.workspaceId,
      sellerUserId: session.account.mercadoLivreUserId,
      source: page === "product" ? "PRODUCT_PAGE" : "SEARCH_CARD",
      query: query ?? null,
      listings,
    });

    const insights = await getMarketInsights(
      session.account.workspaceId,
      listings.map((l) => l.id),
    );

    return NextResponse.json({
      items: insights,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[observations]", error);
    return NextResponse.json(
      { error: "Não foi possível calcular as estimativas agora.", items: [] },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getExtensionSession } from "@/lib/extension-auth";
import { getMarketInsights, recordObservations } from "@/lib/market-intel";

export const dynamic = "force-dynamic";

/**
 * A extensão envia o que a página do Mercado Livre aberta pelo usuário mostra
 * (busca ou anúncio). O Radar guarda a leitura e devolve as estimativas
 * calculadas com o histórico. Nenhuma chamada à API do Mercado Livre aqui.
 */
const MLB_URL = /^https:\/\/([a-z0-9-]+\.)*(mercadolivre\.com\.br|mercadolibre\.com|mlstatic\.com)\//i;
const mlUrl = (max: number) =>
  z.string().trim().max(max).regex(MLB_URL).nullable().optional().catch(null);

const listing = z.object({
  id: z.string().trim().regex(/^MLB\d{6,}$/i),
  title: z.string().trim().min(1).max(300),
  price: z.number().positive().max(10_000_000).nullable(),
  originalPrice: z.number().positive().max(10_000_000).nullable().optional(),
  soldLower: z.number().int().min(0).max(100_000_000).nullable().optional(),
  soldHasPlus: z.boolean().optional(),
  soldLabel: z.string().trim().max(60).nullable().optional(),
  reviews: z.number().int().min(0).max(10_000_000).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  freeShipping: z.boolean().optional(),
  fulfillment: z.boolean().optional(),
  bestSellerRank: z.number().int().min(1).max(1000).nullable().optional().catch(null),
  bestSellerLabel: z.string().trim().max(120).nullable().optional(),
  catalogProductId: z.string().trim().regex(/^MLB\d{5,}$/i).nullable().optional(),
  sellerName: z.string().trim().max(120).nullable().optional(),
  condition: z.string().trim().max(30).nullable().optional(),
  thumbnail: mlUrl(500),
  permalink: mlUrl(800),
  position: z.number().int().min(1).max(500).nullable().optional(),
});

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
      { error: error instanceof Error ? error.message : "Limite da extensão atingido." },
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
      const result = listing.safeParse(entry);
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
      source: page === "product" ? "PRODUCT_PAGE" : "SEARCH_CARD",
      query: query ?? null,
      listings,
    });

    const insights = await getMarketInsights(listings.map((l) => l.id));

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

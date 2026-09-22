import { NextResponse } from "next/server";
import {
  getMlSession,
  searchCatalogProducts,
  searchMarketplace,
} from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

function isBarcode(value: string) {
  return /^\d{8,14}$/.test(value.replace(/\D/g, ""));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim();

    if (query.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const session = await getMlSession();
    const barcode = isBarcode(query)
      ? query.replace(/\D/g, "")
      : null;

    let catalogUnavailable = false;
    const catalog = await searchCatalogProducts({
      accessToken: session.accessToken,
      ...(barcode
        ? { productIdentifier: barcode }
        : { query }),
      limit: 6,
    }).catch(() => {
      catalogUnavailable = true;
      return [];
    });

    const marketplace = await searchMarketplace({
      accessToken: session.accessToken,
      query,
      limit: 12,
    }).catch(() => []);

    const suggestions = [
      ...catalog.map((item) => ({
        key: `catalog:${item.id}`,
        source: "CATALOG" as const,
        id: item.id,
        title: item.name,
        price: null as number | null,
        thumbnail: item.pictures?.[0]?.url ?? null,
        categoryId: null as string | null,
        productIdentifier: barcode,
      })),
      ...marketplace.map((item) => ({
        key: `item:${item.id}`,
        source: "MARKETPLACE" as const,
        id: item.id,
        title: item.title,
        price: item.price,
        thumbnail: item.thumbnail,
        categoryId: item.categoryId,
        productIdentifier: null,
      })),
    ];

    const seen = new Set<string>();
    const unique = suggestions.filter((item) => {
      const normalized = item.title.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

    return NextResponse.json({
      query,
      barcode,
      catalogUnavailable,
      suggestions: unique.slice(0, 10),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao buscar produtos.";

    return NextResponse.json(
      {
        error: message,
        suggestions: [],
      },
      { status: 502 },
    );
  }
}

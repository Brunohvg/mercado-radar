import { NextResponse } from "next/server";
import { z } from "zod";
import { isExtensionAuthorized } from "@/lib/extension-auth";
import { getMlSession, searchMarketplace } from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().trim().min(3).max(180),
  categoryId: z.string().trim().min(3).max(40).optional(),
  itemId: z.string().trim().regex(/^MLB\d+$/i).optional(),
  currentPrice: z.coerce.number().positive().optional(),
});

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "com", "sem", "para", "por", "em",
  "um", "uma", "un", "und", "unid", "unidade", "unidades", "kit", "pacote",
  "novo", "nova", "original", "cor",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function similarity(query: string, title: string) {
  const queryTokens = [...new Set(tokens(query))];
  const titleSet = new Set(tokens(title));

  if (!queryTokens.length) return 0;

  const matches = queryTokens.filter((token) => titleSet.has(token)).length;
  return matches / queryTokens.length;
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export async function GET(request: Request) {
  if (!isExtensionAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = schema.safeParse({
    title: url.searchParams.get("title") ?? "",
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    itemId: url.searchParams.get("itemId") ?? undefined,
    currentPrice: url.searchParams.get("currentPrice") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Contexto insuficiente para comparar mercado." },
      { status: 400 },
    );
  }

  try {
    const session = await getMlSession();
    const results = await searchMarketplace({
      accessToken: session.accessToken,
      query: parsed.data.title,
      categoryId: parsed.data.categoryId,
      limit: 50,
    });

    const ranked = results
      .filter(
        (item) =>
          item.price > 0 &&
          item.id !== parsed.data.itemId?.toUpperCase() &&
          item.sellerId !== session.account.mercadoLivreUserId,
      )
      .map((item) => ({
        ...item,
        similarity: similarity(parsed.data.title, item.title),
      }))
      .filter((item) => item.similarity >= 0.35)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20);

    const source = ranked.length >= 5
      ? ranked
      : results
          .filter(
            (item) =>
              item.price > 0 &&
              item.id !== parsed.data.itemId?.toUpperCase() &&
              item.sellerId !== session.account.mercadoLivreUserId,
          )
          .slice(0, 20)
          .map((item) => ({ ...item, similarity: similarity(parsed.data.title, item.title) }));

    const prices = source.map((item) => item.price).sort((a, b) => a - b);
    if (!prices.length) {
      return NextResponse.json({
        market: null,
        competitors: [],
      });
    }

    const minimum = round2(prices[0]);
    const p25 = round2(percentile(prices, 0.25));
    const median = round2(percentile(prices, 0.5));
    const p75 = round2(percentile(prices, 0.75));
    const maximum = round2(prices[prices.length - 1]);
    const average = round2(prices.reduce((sum, price) => sum + price, 0) / prices.length);

    const currentPrice = parsed.data.currentPrice ?? null;
    const gapToMedian =
      currentPrice && median > 0
        ? round2(((currentPrice - median) / median) * 100)
        : null;

    return NextResponse.json({
      market: {
        count: prices.length,
        minimum,
        p25,
        median,
        p75,
        maximum,
        average,
        currentPrice,
        gapToMedian,
      },
      competitors: source
        .sort((a, b) => a.price - b.price)
        .slice(0, 6)
        .map((item) => ({
          id: item.id,
          title: item.title,
          price: round2(item.price),
          freeShipping: item.freeShipping,
          listingTypeId: item.listingTypeId,
          permalink: item.permalink,
          similarityPercent: Math.round(item.similarity * 100),
        })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao comparar o mercado.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

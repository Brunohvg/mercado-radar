import { NextResponse } from "next/server";
import { z } from "zod";
import { getExtensionSession } from "@/lib/extension-auth";
import { prisma } from "@/lib/prisma";
import {
  getCatalogProductDetails,
  searchCatalogProducts,
  MlApiError,
} from "@/lib/mercado-livre";
import {
  comparableTitle,
  comparisonTokens,
  priceSample,
} from "@/lib/market-comparison";
export const dynamic = "force-dynamic";
const schema = z.object({
  title: z.string().trim().min(3).max(300),
  itemId: z
    .string()
    .regex(/^MLBU?\d+$/i)
    .optional(),
  currentPrice: z.coerce.number().positive().optional(),
});
export async function GET(request: Request) {
  let session;
  try {
    session = await getExtensionSession(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Limite atingido." },
      { status: 429 },
    );
  }
  if (!session)
    return NextResponse.json(
      { error: "Entre no Mercado Radar." },
      { status: 401 },
    );
  const url = new URL(request.url);
  const parsed = schema.safeParse({
    title: url.searchParams.get("title"),
    itemId: url.searchParams.get("itemId") ?? undefined,
    currentPrice: url.searchParams.get("currentPrice") ?? undefined,
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "Informe título e preço válidos." },
      { status: 400 },
    );
  const { title, itemId, currentPrice } = parsed.data;
  const since = new Date(Date.now() - 7 * 86400_000);
  const terms = comparisonTokens(title)
    .filter((t) => t.length >= 3 && !/\d/.test(t))
    .slice(0, 4);
  const seen = await prisma.marketItem.findMany({
    where: {
      workspaceId: session.account.workspaceId,
      isOwn: false,
      lastSeenAt: { gte: since },
      id: { not: itemId?.toUpperCase() },
      ...(terms.length
        ? {
            OR: terms.map((t) => ({
              title: { contains: t, mode: "insensitive" as const },
            })),
          }
        : {}),
    },
    take: 100,
    orderBy: { lastSeenAt: "desc" },
  });
  type Candidate = {
    id: string;
    title: string;
    price: number;
    permalink: string | null;
    source: string;
    capturedAt: string;
    similarityPercent: number;
  };
  const candidates: Candidate[] = seen.flatMap((item) => {
    const match = comparableTitle(title, item.title),
      price = Number(item.lastPrice);
    return match.accepted && price > 0
      ? [
          {
            id: item.id,
            title: item.title,
            price,
            permalink: item.permalink,
            source: "OBSERVED_PAGE",
            capturedAt: item.lastSeenAt.toISOString(),
            similarityPercent: Math.round(match.similarity * 100),
          },
        ]
      : [];
  });
  let apiStatus: number | null = null;
  try {
    const products = await searchCatalogProducts({
      accessToken: session.ml.accessToken,
      query: title,
      limit: 12,
    });
    apiStatus = 200;
    const matches = products
      .filter((p) => comparableTitle(title, p.name).accepted)
      .slice(0, 6);
    const details = await Promise.all(
      matches.map((p) =>
        getCatalogProductDetails({
          accessToken: session.ml.accessToken,
          productId: p.id,
        }).catch(() => null),
      ),
    );
    for (const detail of details) {
      const id = detail?.buy_box_winner?.item_id,
        price = Number(detail?.buy_box_winner?.price);
      if (
        !id ||
        !/^MLB\d+$/.test(id) ||
        id === itemId ||
        !(price > 0) ||
        String(detail?.buy_box_winner?.seller_id ?? "") ===
          session.account.mercadoLivreUserId
      )
        continue;
      const match = comparableTitle(title, detail?.name || "");
      if (!match.accepted) continue;
      candidates.push({
        id,
        title: detail?.name || title,
        price,
        permalink: `https://produto.mercadolivre.com.br/${id.replace(/^MLB/, "MLB-")}-_JM`,
        source: "CATALOG_API",
        capturedAt: new Date().toISOString(),
        similarityPercent: Math.round(match.similarity * 100),
      });
    }
  } catch (error) {
    apiStatus = error instanceof MlApiError ? error.status : 0;
  }
  const competitors = [...new Map(candidates.map((c) => [c.id, c])).values()]
    .sort((a, b) => b.similarityPercent - a.similarityPercent)
    .slice(0, 30);
  return NextResponse.json({
    market: priceSample(
      competitors.map((c) => c.price),
      currentPrice,
    ),
    competitors,
    apiStatus,
    source: "CANDIDATE_SAMPLE",
    needsReview: true,
    capturedWithinDays: 7,
    note: competitors.length
      ? "Candidatos da sua navegação e do catálogo disponível. Confirme quantidade, medida, marca e condição antes de selecionar a amostra. Não representa todo o mercado."
      : "Ainda não há uma amostra comparável. Abra a busca do Mercado Livre e selecione anúncios equivalentes no painel. A API pode restringir o catálogo; isso não impede comparar a busca que você abriu.",
  });
}

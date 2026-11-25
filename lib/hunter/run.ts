import { prisma } from "@/lib/prisma";
import {
  getCatalogProductDetails,
  getCatalogProductOffersSnapshot,
  getCategory,
  getCategoryHighlights,
  getListingPriceQuote,
  getTrends,
  searchCatalogProducts,
} from "@/lib/mercado-livre";
import { getWorkspaceSettings } from "@/lib/workspace-settings";
import { evaluateProduct, median, rankCandidates, ML_FREE_SHIPPING_THRESHOLD, type HunterInput } from "@/lib/hunter/rank";

const cache = new Map<string, { expires: number; value: Promise<unknown> }>();
const MAX_CATEGORIES = 3;
const PER_CATEGORY = 6;

/** Resultado em cache por 30 min por conta: são dezenas de consultas ao ML. */
export function runHunterCached(input: { workspaceId: string; sellerId: string; accessToken: string; refresh?: boolean }) {
  const key = input.workspaceId + ":" + input.sellerId;
  const hit = cache.get(key);
  if (!input.refresh && hit && hit.expires > Date.now()) return hit.value as ReturnType<typeof runHunter>;
  const value = runHunter(input);
  cache.set(key, { expires: Date.now() + 30 * 60_000, value });
  value.catch(() => cache.delete(key));
  return value;
}

export async function runHunter(input: { workspaceId: string; sellerId: string; accessToken: string }) {
  const token = input.accessToken;
  const from = new Date(Date.now() - 30 * 86_400_000);
  const [settings, products, items, orders] = await Promise.all([
    getWorkspaceSettings(input.workspaceId),
    prisma.mercadoLivreProduct.findMany({ where: { sellerUserId: input.sellerId } }),
    prisma.mercadoLivreOrderItem.findMany({
      where: { order: { sellerUserId: input.sellerId, status: "paid", refundDetected: false, dateCreated: { gte: from } } },
      select: { mlItemId: true, quantity: true, unitPrice: true },
    }),
    prisma.mercadoLivreOrder.findMany({
      where: { sellerUserId: input.sellerId, status: "paid", refundDetected: false, dateCreated: { gte: from }, totalAmount: { gte: ML_FREE_SHIPPING_THRESHOLD }, shippingCost: { not: null } },
      select: { shippingCost: true, items: { select: { quantity: true } } },
    }),
  ]);

  // Sementes: categorias onde você já fatura, pela receita dos últimos 30 dias.
  const categoryOf = new Map(products.map((p) => [p.mlItemId, p.categoryId]));
  const revenueByCategory = new Map<string, number>();
  for (const item of items) {
    const cat = categoryOf.get(item.mlItemId);
    if (cat) revenueByCategory.set(cat, (revenueByCategory.get(cat) ?? 0) + Number(item.unitPrice) * item.quantity);
  }
  if (!revenueByCategory.size)
    for (const p of products) if (p.categoryId && p.status === "active") revenueByCategory.set(p.categoryId, (revenueByCategory.get(p.categoryId) ?? 0) + 0.01);
  const seeds = [...revenueByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CATEGORIES).map(([id, revenue]) => ({ id, revenue }));

  const shipUnits = orders.reduce((s, o) => s + o.items.reduce((u, i) => u + i.quantity, 0), 0);
  const ownShippingPerUnit = shipUnits ? orders.reduce((s, o) => s + Number(o.shippingCost), 0) / shipUnits : null;
  const owned = new Set(products.map((p) => p.catalogProductId).filter(Boolean) as string[]);
  const assumptions: string[] = [];
  if (settings.taxPercent == null) assumptions.push("Imposto não cadastrado: o teto de compra usa 0%.");
  if (ownShippingPerUnit == null) assumptions.push("Sem pedidos acima de R$ 79 para medir seu frete: produtos acima disso ficam sem teto.");

  const seedInfo = await Promise.all(
    seeds.map(async (seed) => {
      const [category, highlights, trends] = await Promise.all([
        getCategory({ accessToken: token, categoryId: seed.id }).catch(() => null),
        getCategoryHighlights({ accessToken: token, categoryId: seed.id }).catch(() => null),
        getTrends({ accessToken: token, categoryId: seed.id }).catch(() => []),
      ]);
      const keywords = (Array.isArray(trends) ? trends : []).map((t) => t.keyword).filter(Boolean).slice(0, 8);
      let picks: Array<{ productId: string; position: number | null; keyword: string | null }> = (highlights?.content ?? [])
        .filter((c) => c.type === "PRODUCT" && /^MLB\d+$/.test(c.id))
        .slice(0, PER_CATEGORY)
        .map((c) => ({ productId: c.id, position: c.position, keyword: null }));
      if (!picks.length) {
        // Sem ranking de mais vendidos: usa as buscas em alta e acha o produto de catálogo de cada uma.
        const found = await Promise.all(
          keywords.slice(0, PER_CATEGORY).map((keyword) =>
            searchCatalogProducts({ accessToken: token, query: keyword, limit: 1 })
              .then((r) => (r[0] ? { productId: r[0].id, position: null, keyword } : null))
              .catch(() => null),
          ),
        );
        picks = found.filter((x): x is NonNullable<typeof x> => x !== null);
      }
      return { id: seed.id, name: category?.name ?? null, revenue: seed.revenue, keywords, picks, source: highlights?.content?.length ? "MAIS_VENDIDOS" : "TENDENCIAS" };
    }),
  );

  const seen = new Set<string>();
  const evaluated = await Promise.all(
    seedInfo.flatMap((seed) =>
      seed.picks
        .filter((p) => !seen.has(p.productId) && Boolean(seen.add(p.productId)))
        .map(async (pick) => {
          const [details, offers] = await Promise.all([
            getCatalogProductDetails({ accessToken: token, productId: pick.productId }).catch(() => null),
            getCatalogProductOffersSnapshot({ accessToken: token, productId: pick.productId, limit: 20 }).catch(() => null),
          ]);
          if (!details?.name || !offers?.offers.length) return null;
          const price = median(offers.offers.map((o) => o.price));
          const fee = price
            ? await getListingPriceQuote({ accessToken: token, price, categoryId: seed.id, listingType: "CLASSIC" })
                .then((q) => q.saleFeeAmount)
                .catch(() => null)
            : null;
          const input: HunterInput = {
            productId: pick.productId,
            name: details.name,
            picture: details.pictures?.[0]?.url ?? null,
            permalink: details.permalink ?? `https://www.mercadolivre.com.br/p/${pick.productId}`,
            categoryId: seed.id,
            categoryName: seed.name,
            bestSellerPosition: pick.position,
            trendKeyword: pick.keyword,
            offers: offers.offers.map((o) => ({ price: o.price, sellerId: o.sellerId, logisticType: o.logisticType })),
            offersTotal: offers.total,
            saleFee: fee,
            alreadySelling: owned.has(pick.productId),
          };
          return evaluateProduct(input, {
            taxPercent: settings.taxPercent == null ? null : Number(settings.taxPercent),
            operatingCost: Number(settings.operatingCostDefault),
            targetMarginPercent: Number(settings.targetMarginPercent),
            ownShippingPerUnit,
            testLotUnits: 10,
          });
        }),
    ),
  );

  return {
    generatedAt: new Date().toISOString(),
    seeds: seedInfo.map(({ id, name, revenue, keywords, source }) => ({ id, name, revenue: Math.round(revenue * 100) / 100, keywords, source })),
    candidates: rankCandidates(evaluated.filter((x): x is NonNullable<typeof x> => x !== null)),
    assumptions,
  };
}

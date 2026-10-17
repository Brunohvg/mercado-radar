import {
  getCatalogProductOffersSnapshot,
  getItemVisitWindow,
} from "@/lib/mercado-livre";

/** Small per-account cache; API restrictions remain unknown, never numeric zero. */
const cache = new Map<string, { expires: number; value: Promise<unknown> }>();
export async function getExtensionAnalytics(input: {
  workspaceId: string;
  accountId: string;
  accessToken: string;
  itemId: string | null;
  catalogProductId: string | null;
}) {
  const key = JSON.stringify([
    input.workspaceId,
    input.accountId,
    input.itemId,
    input.catalogProductId,
  ]);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  const value = read(input);
  cache.set(key, { expires: Date.now() + 5 * 60000, value });
  return value;
}
async function read(input: Parameters<typeof getExtensionAnalytics>[0]) {
  const ending = new Date().toISOString().slice(0, 10);
  const visit = (id: string) =>
    getItemVisitWindow({
      accessToken: input.accessToken,
      itemId: id,
      ending,
    }).catch(() => null);
  const [itemVisits, catalog] = await Promise.all([
    input.itemId ? visit(input.itemId) : null,
    input.catalogProductId
      ? getCatalogProductOffersSnapshot({
          accessToken: input.accessToken,
          productId: input.catalogProductId,
          limit: 20,
        }).catch(() => null)
      : null,
  ]);
  const offers = catalog?.offers || [];
  const sampled = await Promise.all(
    offers.slice(0, 6).map(async (offer) => ({
      offer,
      visits:
        offer.itemId === itemVisits?.itemId
          ? itemVisits
          : await visit(offer.itemId),
    })),
  );
  const dated = sampled.filter(
    (row) => row.visits != null && row.offer.logisticType != null,
  );
  const first = dated[0]?.visits;
  const sameWindow = dated.filter(
    (row) => row.visits!.from === first?.from && row.visits!.to === first?.to,
  );
  const totalVisits = sameWindow.reduce(
    (sum, row) => sum + row.visits!.total,
    0,
  );
  const fullVisits = sameWindow
    .filter((row) => row.offer.logisticType === "fulfillment")
    .reduce((sum, row) => sum + row.visits!.total, 0);
  return {
    source: "MERCADO_LIVRE_API",
    generatedAt: new Date().toISOString(),
    itemVisits,
    catalog: input.catalogProductId
      ? {
          id: input.catalogProductId,
          availability: catalog ? "AVAILABLE" : "UNAVAILABLE",
          offersObserved: catalog ? offers.length : null,
          totalReported: catalog?.total ?? null,
          sellersObserved: catalog
            ? new Set(offers.map((offer) => offer.sellerId).filter(Boolean))
                .size
            : null,
          fullOffersObserved: catalog
            ? offers.filter((offer) => offer.logisticType === "fulfillment")
                .length
            : null,
          visitsSample:
            first && sameWindow.length
              ? {
                  offersMeasured: sameWindow.length,
                  from: first.from,
                  to: first.to,
                  days: first.days,
                  perDay: totalVisits / first.days,
                  fullVisitSharePercent:
                    totalVisits > 0 ? (fullVisits / totalVisits) * 100 : null,
                }
              : null,
          note: "Ofertas identificadas pela API. Visitas somadas das ofertas medidas; não são visitantes únicos do catálogo. Cobertura pode ser parcial.",
        }
      : null,
  };
}

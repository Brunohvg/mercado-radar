import { prisma } from "@/lib/prisma";
import {
  getWorkspaceMlAccount,
  getMlSessionForAccount,
  getItemsBulkDetailed,
  getCatalogProductOffersSnapshot,
  getCatalogProductDetails,
  searchCompetitionPage,
  MlApiError,
} from "@/lib/mercado-livre";
import {
  parseCompetitorQuery,
  kitQuantity,
  unitPrice,
  safeMlImage,
  safeMlLink,
  type Competitor,
} from "@/lib/competitor-analysis";

function availableNumber(value: unknown) {
  return (typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")) &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0
    ? Number(value)
    : null;
}
function fromApi(
  raw: Record<string, any>,
  ownSeller: string,
  at: string,
): Competitor {
  const attributes = Array.isArray(raw.attributes) ? raw.attributes : [];
  const attr = (id: string) =>
    attributes.find((a: any) => a.id === id)?.value_name?.slice(0, 160) ?? null;
  const quantity = kitQuantity(String(raw.title ?? raw.id), attributes);
  const price =
    raw.currency_id && raw.currency_id !== "BRL"
      ? null
      : availableNumber(raw.price);
  return {
    id: raw.id,
    title: String(raw.title ?? raw.id),
    price: price && price > 0 ? price : null,
    thumbnail: safeMlImage(raw.thumbnail),
    permalink: safeMlLink(raw.permalink),
    brand: attr("BRAND"),
    model: attr("MODEL"),
    color: attr("COLOR"),
    material: attr("MATERIAL"),
    status: typeof raw.status === "string" ? raw.status : null,
    quantity: quantity.quantity,
    quantitySource: quantity.source,
    unitPrice: unitPrice(price, quantity.quantity),
    categoryId: raw.category_id ?? null,
    catalogProductId: raw.catalog_product_id ?? null,
    sellerId: raw.seller_id == null ? null : String(raw.seller_id),
    sellerName: raw.seller?.nickname ?? null,
    reputation: raw.seller?.seller_reputation?.level_id ?? null,
    listingType: raw.listing_type_id ?? null,
    freeShipping:
      typeof raw.shipping?.free_shipping === "boolean"
        ? raw.shipping.free_shipping
        : null,
    fulfillment: raw.shipping?.logistic_type
      ? raw.shipping.logistic_type === "fulfillment"
      : null,
    sold: availableNumber(raw.sold_quantity),
    soldIsLowerBound: false,
    isOwn: String(raw.seller_id) === ownSeller,
    source: "ML_API",
    observedAt: at,
  };
}
/** A bounded search, not a market census. Stored observations never become fresh API data. */
export async function researchCompetitors(input: {
  workspaceId: string;
  query: string;
  categoryId?: string;
  offset: number;
}) {
  const parsed = parseCompetitorQuery(input.query);
  const account = await getWorkspaceMlAccount(input.workspaceId);
  const notices: Array<{ code: string; message: string }> = [];
  const items = new Map<string, Competitor>();
  const observedAt = new Date().toISOString();
  let searchQuery = parsed.query;
  if (!parsed.id) {
    const local = await prisma.product.findFirst({
      where: {
        workspaceId: input.workspaceId,
        sku: { equals: parsed.query, mode: "insensitive" },
      },
      select: { name: true },
    });
    const synced =
      !local && account
        ? await prisma.mercadoLivreProduct.findFirst({
            where: {
              sellerUserId: account.mercadoLivreUserId,
              sku: { equals: parsed.query, mode: "insensitive" },
            },
            select: { title: true },
          })
        : null;
    searchQuery = local?.name ?? synced?.title ?? parsed.query;
    if (searchQuery !== parsed.query)
      notices.push({
        code: "SKU_RESOLVED",
        message: `SKU da sua operação reconhecido. Pesquisa pelo produto: ${searchQuery}.`,
      });
  }
  let total: number | null = null,
    hasMore = false,
    nextOffset: number | null = null;
  let apiSucceeded = false;
  const addIssue = (error: unknown) => {
    const code = error instanceof MlApiError ? error.code : "UNAVAILABLE";
    if (!notices.some((n) => n.code === code))
      notices.push({
        code,
        message:
          error instanceof MlApiError
            ? error.message
            : "Consulta oficial indisponível. As leituras salvas abaixo continuam identificadas pela data de coleta.",
      });
  };
  if (account) {
    try {
      const { accessToken } = await getMlSessionForAccount(account.id);
      const seller = account.mercadoLivreUserId;
      const details = async (ids: string[]) => {
        if (!ids.length) return;
        const result = await getItemsBulkDetailed({
          accessToken,
          itemIds: ids,
        });
        for (const d of result.items) {
          const entry = d.raw as { body?: Record<string, unknown> };
          if (entry.body && /^MLB\d+$/.test(d.id))
            items.set(d.id, fromApi(entry.body, seller, observedAt));
        }
        if (result.restrictedIds.length)
          notices.push({
            code: "PARTIAL_ITEMS",
            message: `${result.restrictedIds.length} anúncio(s) não disponibilizado(s) pela API. Não entram como preço zero.`,
          });
      };
      if (parsed.id && input.offset === 0) {
        if (!parsed.catalog) await details([parsed.id]);
        const reference = items.get(parsed.id);
        const catalogId = parsed.catalog
          ? parsed.id
          : reference?.catalogProductId;
        if (catalogId) {
          const offers = await getCatalogProductOffersSnapshot({
            accessToken,
            productId: catalogId,
            limit: 20,
          }).catch((error) => {
            addIssue(error);
            return null;
          });
          if (offers) {
            await details(offers.offers.map((o) => o.itemId));
            total = offers.total;
          }
        }
        let query = reference?.title;
        if (parsed.catalog && !query)
          query = (
            await getCatalogProductDetails({
              accessToken,
              productId: parsed.id,
            }).catch((error) => {
              addIssue(error);
              return null;
            })
          )?.name;
        if (query) {
          const page = await searchCompetitionPage({
            accessToken,
            query,
            categoryId: input.categoryId,
            offset: 0,
            limit: 20,
          }).catch((error) => {
            addIssue(error);
            return null;
          });
          if (page) await details(page.items.map((i) => i.id));
        }
        apiSucceeded = true;
      } else if (!parsed.id) {
        const page = await searchCompetitionPage({
          accessToken,
          query: searchQuery,
          categoryId: input.categoryId,
          offset: input.offset,
          limit: 20,
        });
        apiSucceeded = true;
        total = page.total;
        hasMore = page.hasMore;
        nextOffset = hasMore ? input.offset + 20 : null;
        // Search facts remain useful even when item enrichment is restricted.
        for (const raw of page.items)
          items.set(raw.id, fromApi(raw, seller, observedAt));
        await details(page.items.map((i) => i.id)).catch(addIssue);
      }
    } catch (error) {
      addIssue(error);
    }
  } else
    notices.push({
      code: "CONNECT_ACCOUNT",
      message:
        "Conecte sua conta em Integrações para consultar a API. Você pode comparar as leituras já capturadas pela extensão.",
    });
  const words = searchQuery.split(/\s+/).filter(Boolean).slice(0, 12);
  const observations = await prisma.marketItem.findMany({
    where: {
      workspaceId: input.workspaceId,
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(parsed.id
        ? { OR: [{ id: parsed.id }, { catalogProductId: parsed.id }] }
        : {
            AND: words.map((word) => ({
              title: { contains: word, mode: "insensitive" as const },
            })),
          }),
    },
    orderBy: { lastSeenAt: "desc" },
    take: 60,
  });
  // Saved observations only on first page; remote pagination does not duplicate them.
  if (input.offset === 0)
    for (const row of observations)
      if (!items.has(row.id)) {
        const quantity = kitQuantity(row.title);
        const price = row.lastPrice == null ? null : Number(row.lastPrice);
        items.set(row.id, {
          id: row.id,
          title: row.title,
          price,
          thumbnail: safeMlImage(row.thumbnail),
          permalink: safeMlLink(row.permalink),
          brand: null,
          model: null,
          color: null,
          quantity: quantity.quantity,
          quantitySource: quantity.source,
          unitPrice: unitPrice(price, quantity.quantity),
          categoryId: row.categoryId,
          catalogProductId: row.catalogProductId,
          sellerId: row.sellerId,
          sellerName: row.sellerName,
          reputation: null,
          listingType: null,
          freeShipping: row.freeShipping,
          fulfillment: row.fulfillment,
          sold: row.lastSoldLower,
          soldIsLowerBound: row.lastSoldUpper !== row.lastSoldLower,
          isOwn: row.isOwn,
          source: "RADAR_OBSERVATION",
          observedAt: row.lastSeenAt.toISOString(),
        });
      }
  return {
    query: parsed.query,
    referenceId: parsed.id && !parsed.catalog ? parsed.id : null,
    items: [...items.values()],
    notices,
    observedAt,
    apiSucceeded,
    paging: { offset: input.offset, total, hasMore, nextOffset },
    scope:
      "Amostra de ofertas disponíveis para esta conta e leituras da sua operação. Não representa todos os vendedores do mercado.",
  };
}

/**
 * Adaptador do Mercado Livre. Cada sinal é buscado de forma independente:
 * uma API restrita ou fora do ar não derruba as outras.
 */
import {
  getCategory,
  getCategoryAttributes,
  getItemFullDetails,
  getItemPrices,
  getItemQuestions,
  getItemReviews,
  getPublicUser,
  MlApiError,
} from "@/lib/mercado-livre";
import {
  empty,
  ok,
  unavailable,
  type ListingInsights,
  type MarketplaceAdapter,
  type Signal,
  type PriceSignal,
  type SellerSignal,
  type QuestionsSignal,
  type ReviewsSignal,
  type CategorySignal,
} from "@/lib/marketplaces/types";
import {
  normalizeCategory,
  normalizePrices,
  normalizeQuestions,
  normalizeReviews,
  normalizeSeller,
} from "@/lib/marketplaces/mercado-livre/normalize";

function failure<T>(error: unknown, what: string): Signal<T> {
  if (error instanceof MlApiError) {
    if (error.status === 401) return unavailable(`${what}: reconecte o Mercado Livre.`);
    if (error.status === 403) return unavailable(`${what}: o Mercado Livre não liberou esta consulta para o aplicativo.`);
    if (error.status === 404) return empty(`${what}: o Mercado Livre não tem este dado para o anúncio.`);
    if (error.status === 429) return unavailable(`${what}: limite de consultas atingido, tente mais tarde.`);
  }
  return unavailable(`${what}: indisponível agora.`);
}

async function settle<T>(what: string, run: () => Promise<Signal<T>>): Promise<Signal<T>> {
  try {
    return await run();
  } catch (error) {
    return failure<T>(error, what);
  }
}

export const mercadoLivreAdapter: MarketplaceAdapter = {
  id: "MERCADO_LIVRE",
  label: "Mercado Livre",
  listingIdPattern: /^MLB\d{5,15}$/,
  capabilities: {
    identity: { state: "EM_USO", source: "/items/{id}?include_attributes=all", auth: "CONTA_CONECTADA" },
    price: { state: "EM_USO", source: "/items/{id}/prices", auth: "CONTA_CONECTADA" },
    quantityPricing: { state: "EM_USO", source: "/items/{id}/prices (min_purchase_unit, user_type_business)", auth: "CONTA_CONECTADA" },
    seller: { state: "EM_USO", source: "/users/{id}", auth: "CONTA_CONECTADA" },
    questions: { state: "EM_USO", source: "/questions/search?item={id}", auth: "CONTA_CONECTADA" },
    reviews: { state: "EM_USO", source: "/reviews/item/{id}", auth: "CONTA_CONECTADA" },
    categoryRequirements: { state: "EM_USO", source: "/categories/{id} e /categories/{id}/attributes", auth: "CONTA_CONECTADA" },
    fees: { state: "EM_USO", source: "/sites/MLB/listing_prices", auth: "CONTA_CONECTADA" },
    shipping: { state: "EM_USO", source: "/users/{id}/shipping_options/free, /shipments/{id}/costs", auth: "CONTA_CONECTADA" },
    visits: { state: "EM_USO", source: "/visits/items, /items/{id}/visits/time_window", auth: "CONTA_CONECTADA" },
    catalogCompetition: { state: "EM_USO", source: "/products/{id}, /products/{id}/items, /items/{id}/price_to_win", auth: "CONTA_CONECTADA" },
    trends: { state: "EM_USO", source: "/trends/MLB, /highlights/MLB/category/{id}", auth: "CONTA_CONECTADA" },
    ads: { state: "EM_USO", source: "/advertising/... product_ads", auth: "CONTA_CONECTADA" },
    orders: { state: "EM_USO", source: "/orders/search, /orders/{id}/shipments", auth: "CONTA_CONECTADA" },
  },

  async collectInsights(auth, listingId): Promise<ListingInsights> {
    const base = {
      marketplace: "MERCADO_LIVRE" as const,
      listingId,
      collectedAt: new Date().toISOString(),
    };
    if (!auth.accessToken) {
      const off = unavailable<never>("Conecte o Mercado Livre para ler este sinal.");
      return { ...base, price: off, seller: off, questions: off, reviews: off, category: off };
    }
    const accessToken = auth.accessToken;

    let item: Awaited<ReturnType<typeof getItemFullDetails>> | null = null;
    try {
      item = await getItemFullDetails({ accessToken, itemId: listingId });
    } catch {
      item = null;
    }
    const sellerId = item?.seller_id != null ? String(item.seller_id) : null;
    const categoryId = item?.category_id ?? null;
    const filledAttributes = (item?.attributes ?? [])
      .filter((a) => a.id && (a.value_name ?? (a.values ?? []).some((v) => v.name)))
      .map((a) => a.id!);

    const [price, seller, questions, reviews, category] = await Promise.all([
      settle<PriceSignal>("Preços", async () => {
        const data = normalizePrices(await getItemPrices({ accessToken, itemId: listingId }));
        return data ? ok(data) : empty("O anúncio não informou preço.");
      }),
      sellerId
        ? settle<SellerSignal>("Vendedor", async () => {
            const data = normalizeSeller(await getPublicUser({ accessToken, userId: sellerId }));
            return data ? ok(data) : empty("Perfil do vendedor sem dados.");
          })
        : Promise.resolve(unavailable<SellerSignal>("Vendedor não identificado no anúncio.")),
      settle<QuestionsSignal>("Perguntas", async () => ok(normalizeQuestions(await getItemQuestions({ accessToken, itemId: listingId })))),
      settle<ReviewsSignal>("Opiniões", async () => {
        const data = normalizeReviews(await getItemReviews({ accessToken, itemId: listingId }));
        return data.total ? ok(data) : empty("Ainda sem opiniões neste anúncio.");
      }),
      categoryId
        ? settle<CategorySignal>("Categoria", async () => {
            const [info, attrs] = await Promise.all([
              getCategory({ accessToken, categoryId }),
              getCategoryAttributes({ accessToken, categoryId }).catch(() => []),
            ]);
            const data = normalizeCategory(info, attrs, filledAttributes);
            return data ? ok(data) : empty("Categoria sem dados.");
          })
        : Promise.resolve(unavailable<CategorySignal>("Categoria não identificada no anúncio.")),
    ]);
    return { ...base, price, seller, questions, reviews, category };
  },
};

import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security";

const API = "https://api.mercadolibre.com";

export type MlListingType = "CLASSIC" | "PREMIUM";

export function listingTypeId(type: MlListingType) {
  return type === "PREMIUM" ? "gold_pro" : "gold_special";
}

function credentials() {
  const clientId = process.env.MERCADO_LIVRE_CLIENT_ID;
  const clientSecret = process.env.MERCADO_LIVRE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais do Mercado Livre não configuradas.");
  }

  return { clientId, clientSecret };
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        typeof body?.message === "string"
          ? body.message
          : `Mercado Livre respondeu HTTP ${response.status}`;
      throw new Error(message);
    }

    return body as T;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Error(
        "O Mercado Livre demorou demais para responder. Tente novamente em alguns segundos.",
      );
    }

    throw error;
  }
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  });

  return jsonFetch<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id: number;
    scope?: string;
  }>(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function fetchCurrentUser(accessToken: string) {
  return jsonFetch<{ id: number; nickname?: string }>(`${API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  return jsonFetch<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  }>(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function saveMlAccount(input: {
  userId: string;
  nickname?: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope?: string;
}) {
  return prisma.mercadoLivreAccount.upsert({
    where: { mercadoLivreUserId: input.userId },
    update: {
      nickname: input.nickname,
      accessTokenEncrypted: encryptSecret(input.accessToken),
      refreshTokenEncrypted: encryptSecret(input.refreshToken),
      tokenExpiresAt: new Date(Date.now() + input.expiresIn * 1000),
      scopes: input.scope,
    },
    create: {
      mercadoLivreUserId: input.userId,
      nickname: input.nickname,
      accessTokenEncrypted: encryptSecret(input.accessToken),
      refreshTokenEncrypted: encryptSecret(input.refreshToken),
      tokenExpiresAt: new Date(Date.now() + input.expiresIn * 1000),
      scopes: input.scope,
    },
  });
}

export async function getMlSession() {
  const account = await prisma.mercadoLivreAccount.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!account) {
    throw new Error("Conta do Mercado Livre ainda não conectada.");
  }

  if (account.tokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return {
      account,
      accessToken: decryptSecret(account.accessTokenEncrypted),
    };
  }

  const refreshed = await refreshAccessToken(
    decryptSecret(account.refreshTokenEncrypted),
  );

  const updated = await prisma.mercadoLivreAccount.update({
    where: { id: account.id },
    data: {
      accessTokenEncrypted: encryptSecret(refreshed.access_token),
      refreshTokenEncrypted: refreshed.refresh_token
        ? encryptSecret(refreshed.refresh_token)
        : account.refreshTokenEncrypted,
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      scopes: refreshed.scope ?? account.scopes,
    },
  });

  return { account: updated, accessToken: refreshed.access_token };
}

export async function getListingPriceQuote(input: {
  accessToken: string;
  price: number;
  categoryId: string;
  listingType: MlListingType;
  logisticType?: string;
  shippingMode?: string;
}) {
  const query = new URLSearchParams({
    price: String(input.price),
    currency_id: "BRL",
    category_id: input.categoryId,
    listing_type_id: listingTypeId(input.listingType),
    logistic_type: input.logisticType ?? "drop_off",
    shipping_mode: input.shippingMode ?? "me2",
  });

  const raw = await jsonFetch<any>(
    `${API}/sites/MLB/listing_prices?${query.toString()}`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );

  const quote = Array.isArray(raw) ? raw[0] : raw;
  if (!quote) {
    throw new Error("Mercado Livre não retornou tarifa para essa combinação.");
  }

  const saleFeeAmount = Number(quote.sale_fee_amount ?? 0);
  const fixedFee = Number(quote.sale_fee_details?.fixed_fee ?? 0);
  const variableFee = Math.max(0, saleFeeAmount - fixedFee);
  const commissionPercent =
    input.price > 0 ? (variableFee / input.price) * 100 : 0;

  return {
    raw,
    saleFeeAmount,
    fixedFee,
    commissionPercent,
  };
}

export async function getShippingQuote(input: {
  accessToken: string;
  userId: string;
  price: number;
  listingType: MlListingType;
  weightGrams: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  logisticType?: string;
  shippingMode?: string;
}) {
  const dimensions =
    `${Math.round(input.heightCm)}x${Math.round(input.widthCm)}x${Math.round(input.lengthCm)},${Math.round(input.weightGrams)}`;

  const query = new URLSearchParams({
    dimensions,
    verbose: "true",
    item_price: String(input.price),
    listing_type_id: listingTypeId(input.listingType),
    mode: input.shippingMode ?? "me2",
    condition: "new",
    logistic_type: input.logisticType ?? "drop_off",
    free_shipping: "True",
  });

  const raw = await jsonFetch<any>(
    `${API}/users/${input.userId}/shipping_options/free?${query.toString()}`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );

  const coverage = raw?.coverage?.all_country;
  if (!coverage) {
    throw new Error("Mercado Livre não retornou cotação de frete.");
  }

  return {
    raw,
    shippingCost: Number(coverage.list_cost ?? 0),
    billableWeight: Number(coverage.billable_weight ?? input.weightGrams),
    discountRate: Number(coverage.discount?.rate ?? 0),
    promotedAmount: Number(coverage.discount?.promoted_amount ?? 0),
  };
}


export async function predictCategory(input: {
  accessToken: string;
  title: string;
  limit?: number;
}) {
  const query = new URLSearchParams({
    q: input.title,
    limit: String(input.limit ?? 3),
  });

  let raw: Array<{
    domain_id?: string;
    domain_name?: string;
    category_id: string;
    category_name: string;
    attributes?: Array<{
      id: string;
      value_id?: string;
      value_name?: string;
    }>;
  }>;

  try {
    raw = await jsonFetch(
      `${API}/sites/MLB/domain_discovery/search?${query.toString()}`,
      { headers: { Authorization: `Bearer ${input.accessToken}` } },
    );
  } catch {
    raw = await jsonFetch(
      `${API}/sites/MLB/domain_discovery/search?${query.toString()}`,
    );
  }

  return raw.map((item) => ({
    domainId: item.domain_id ?? null,
    domainName: item.domain_name ?? null,
    categoryId: item.category_id,
    categoryName: item.category_name,
    attributes: item.attributes ?? [],
  }));
}


export type MarketplaceSearchItem = {
  id: string;
  title: string;
  price: number;
  currencyId: string;
  permalink: string | null;
  thumbnail: string | null;
  categoryId: string | null;
  sellerId: string | null;
  listingTypeId: string | null;
  freeShipping: boolean;
};

export async function searchMarketplace(input: {
  accessToken: string;
  query: string;
  categoryId?: string;
  limit?: number;
}) {
  const params = new URLSearchParams({
    q: input.query,
    limit: String(Math.min(Math.max(input.limit ?? 30, 1), 50)),
  });

  if (input.categoryId) {
    params.set("category", input.categoryId);
  }

  type MarketplaceSearchResponse = {
    results?: Array<{
      id?: string;
      title?: string;
      price?: number;
      currency_id?: string;
      permalink?: string;
      thumbnail?: string;
      category_id?: string;
      seller?: { id?: number | string };
      listing_type_id?: string;
      shipping?: { free_shipping?: boolean };
    }>;
  };

  let raw: MarketplaceSearchResponse;

  try {
    raw = await jsonFetch<MarketplaceSearchResponse>(
      `${API}/sites/MLB/search?${params.toString()}`,
      { headers: { Authorization: `Bearer ${input.accessToken}` } },
    );
  } catch {
    raw = await jsonFetch<MarketplaceSearchResponse>(
      `${API}/sites/MLB/search?${params.toString()}`,
    );
  }

  return (raw.results ?? [])
    .filter((item) => item.id && item.title)
    .map<MarketplaceSearchItem>((item) => ({
      id: String(item.id),
      title: String(item.title),
      price: Number(item.price ?? 0),
      currencyId: String(item.currency_id ?? "BRL"),
      permalink: item.permalink ?? null,
      thumbnail: item.thumbnail ?? null,
      categoryId: item.category_id ?? null,
      sellerId: item.seller?.id == null ? null : String(item.seller.id),
      listingTypeId: item.listing_type_id ?? null,
      freeShipping: Boolean(item.shipping?.free_shipping),
    }));
}

export async function getItemCurrentPrice(input: {
  accessToken: string;
  itemId: string;
}) {
  const raw = await jsonFetch<{
    prices?: Array<{
      type?: string;
      amount?: number;
      conditions?: {
        context_restrictions?: string[];
        min_purchase_unit?: number;
      };
    }>;
  }>(`${API}/items/${input.itemId}/prices`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  const prices = (raw.prices ?? []).filter(
    (price) => Number(price.amount) > 0,
  );

  const consumerPrices = prices.filter((price) => {
    const restrictions = price.conditions?.context_restrictions ?? [];
    return (
      !restrictions.includes("user_type_business") &&
      (price.conditions?.min_purchase_unit ?? 1) <= 1
    );
  });

  const candidates = consumerPrices.length > 0 ? consumerPrices : prices;
  const promotion = candidates.find((price) => price.type === "promotion");
  const standard = candidates.find((price) => price.type === "standard");
  const selected = promotion ?? standard ?? candidates[0];

  return selected ? Number(selected.amount) : null;
}


export async function getSellerItemIds(input: {
  accessToken: string;
  userId: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams({
    limit: String(Math.min(Math.max(input.limit ?? 50, 1), 50)),
    offset: String(Math.max(input.offset ?? 0, 0)),
  });

  if (input.status) params.set("status", input.status);

  return jsonFetch<{
    seller_id?: string | number;
    paging?: { total?: number; offset?: number; limit?: number };
    results?: string[];
  }>(
    `${API}/users/${input.userId}/items/search?${params.toString()}`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );
}

export type SellerItemDetail = {
  id: string;
  title: string;
  categoryId: string | null;
  status: string;
  listingTypeId: string | null;
  availableQuantity: number;
  soldQuantity: number;
  permalink: string | null;
  thumbnail: string | null;
  freeShipping: boolean;
  sellerSku: string | null;
  raw: unknown;
};

export async function getItemsBulk(input: {
  accessToken: string;
  itemIds: string[];
}) {
  if (input.itemIds.length === 0) return [] as SellerItemDetail[];

  const ids = input.itemIds.slice(0, 50).join(",");
  const params = new URLSearchParams({
    ids,
    attributes: [
      "body.id",
      "body.title",
      "body.category_id",
      "body.status",
      "body.listing_type_id",
      "body.available_quantity",
      "body.sold_quantity",
      "body.permalink",
      "body.thumbnail",
      "body.shipping",
      "body.seller_custom_field",
      "body.attributes",
    ].join(","),
  });

  const raw = await jsonFetch<Array<{
    id?: string;
    status_code?: number;
    body?: {
      id?: string;
      title?: string;
      category_id?: string;
      status?: string;
      listing_type_id?: string;
      available_quantity?: number;
      sold_quantity?: number;
      permalink?: string;
      thumbnail?: string;
      seller_custom_field?: string;
      shipping?: { free_shipping?: boolean };
      attributes?: Array<{
        id?: string;
        value_name?: string;
      }>;
    };
  }>>(
    `${API}/items/bulk?${params.toString()}`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );

  return raw
    .filter((entry) => entry.body?.id)
    .map<SellerItemDetail>((entry) => {
      const body = entry.body!;
      const sellerSku =
        body.seller_custom_field ??
        body.attributes?.find((attribute) => attribute.id === "SELLER_SKU")
          ?.value_name ??
        null;

      return {
        id: String(body.id),
        title: String(body.title ?? body.id),
        categoryId: body.category_id ?? null,
        status: String(body.status ?? "unknown"),
        listingTypeId: body.listing_type_id ?? null,
        availableQuantity: Number(body.available_quantity ?? 0),
        soldQuantity: Number(body.sold_quantity ?? 0),
        permalink: body.permalink ?? null,
        thumbnail: body.thumbnail ?? null,
        freeShipping: Boolean(body.shipping?.free_shipping),
        sellerSku,
        raw: entry,
      };
    });
}

export async function getItemsCurrentPrices(input: {
  accessToken: string;
  itemIds: string[];
}) {
  const entries = await Promise.all(
    input.itemIds.slice(0, 50).map(async (itemId) => {
      try {
        const price = await getItemCurrentPrice({
          accessToken: input.accessToken,
          itemId,
        });
        return [itemId, price] as const;
      } catch {
        return [itemId, null] as const;
      }
    }),
  );

  return Object.fromEntries(entries) as Record<string, number | null>;
}

export async function getItemsVisitTotals(input: {
  accessToken: string;
  itemIds: string[];
}) {
  if (input.itemIds.length === 0) return {} as Record<string, number>;

  const params = new URLSearchParams({
    ids: input.itemIds.slice(0, 50).join(","),
  });

  const raw = await jsonFetch<Record<string, number>>(
    `${API}/visits/items?${params.toString()}`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );

  return raw;
}

export type SellerOrderSearchResult = {
  paging?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
  results?: Array<Record<string, any>>;
};

export async function getSellerOrders(input: {
  accessToken: string;
  userId: string;
  days?: number;
  limit?: number;
  offset?: number;
}) {
  const days = Math.min(Math.max(input.days ?? 30, 1), 365);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    seller: input.userId,
    limit: String(Math.min(Math.max(input.limit ?? 50, 1), 50)),
    offset: String(Math.max(input.offset ?? 0, 0)),
    "order.date_created.from": from.toISOString(),
  });

  return jsonFetch<SellerOrderSearchResult>(
    `${API}/orders/search?${params.toString()}`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );
}


export type CatalogProductSearchResult = {
  id: string;
  name: string;
  domainId: string | null;
  status: string | null;
  attributes: Array<{
    id: string;
    name?: string;
    valueName?: string;
  }>;
  pictures: Array<{ id?: string; url?: string }>;
  raw: unknown;
};

export async function searchCatalogProducts(input: {
  accessToken: string;
  query?: string;
  productIdentifier?: string;
  limit?: number;
}) {
  const params = new URLSearchParams({
    site_id: "MLB",
    status: "active",
    limit: String(Math.min(Math.max(input.limit ?? 10, 1), 20)),
  });

  if (input.productIdentifier) {
    params.set("product_identifier", input.productIdentifier);
  } else if (input.query) {
    params.set("q", input.query);
  } else {
    throw new Error("Informe um nome ou código de barras.");
  }

  const raw = await jsonFetch<{
    results?: Array<{
      id?: string;
      name?: string;
      domain_id?: string;
      status?: string;
      attributes?: Array<{
        id?: string;
        name?: string;
        value_name?: string;
      }>;
      pictures?: Array<{ id?: string; url?: string }>;
    }>;
  }>(`${API}/products/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  return (raw.results ?? [])
    .filter((item) => item.id && item.name)
    .map<CatalogProductSearchResult>((item) => ({
      id: String(item.id),
      name: String(item.name),
      domainId: item.domain_id ?? null,
      status: item.status ?? null,
      attributes: (item.attributes ?? [])
        .filter((attribute) => attribute.id)
        .map((attribute) => ({
          id: String(attribute.id),
          name: attribute.name,
          valueName: attribute.value_name,
        })),
      pictures: item.pictures ?? [],
      raw: item,
    }));
}

export async function getItemFullDetails(input: {
  accessToken: string;
  itemId: string;
}) {
  return jsonFetch<{
    id?: string;
    title?: string;
    category_id?: string;
    attributes?: Array<{
      id?: string;
      name?: string;
      value_name?: string;
      value_struct?: {
        number?: number;
        unit?: string;
      } | null;
      values?: Array<{
        name?: string;
        struct?: {
          number?: number;
          unit?: string;
        } | null;
      }>;
    }>;
    shipping?: {
      dimensions?: string | null;
      free_shipping?: boolean;
    };
  }>(
    `${API}/items/${input.itemId}?include_attributes=all`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );
}

export async function getTrends(input: {
  accessToken: string;
  categoryId?: string;
}) {
  const suffix = input.categoryId ? `/${input.categoryId}` : "";
  return jsonFetch<Array<{ keyword: string; url?: string }>>(
    `${API}/trends/MLB${suffix}`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );
}

export async function getCategoryHighlights(input: {
  accessToken: string;
  categoryId: string;
}) {
  return jsonFetch<{
    query_data?: {
      highlight_type?: string;
      criteria?: string;
      id?: string;
    };
    content?: Array<{
      id: string;
      position: number;
      type: "ITEM" | "PRODUCT" | "USER_PRODUCT" | string;
    }>;
  }>(
    `${API}/highlights/MLB/category/${input.categoryId}`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );
}


export async function getShipmentCosts(input: {
  accessToken: string;
  shipmentId: string;
}) {
  const raw = await jsonFetch<{
    gross_amount?: number;
    receiver?: {
      cost?: number;
      promoted_amount?: number;
    };
    senders?: Array<{
      id?: number | string;
      cost?: number;
      promoted_amount?: number;
    }>;
  }>(
    `${API}/shipments/${input.shipmentId}/costs`,
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "x-format-new": "true",
      },
    },
  );

  const sellerCost = (raw.senders ?? []).reduce(
    (sum, sender) => sum + Number(sender.cost ?? 0),
    0,
  );

  return {
    raw,
    sellerCost,
    buyerCost: Number(raw.receiver?.cost ?? 0),
    grossAmount: Number(raw.gross_amount ?? 0),
  };
}

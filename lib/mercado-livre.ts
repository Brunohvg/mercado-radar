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

  const raw = await jsonFetch<Array<{
    domain_id?: string;
    domain_name?: string;
    category_id: string;
    category_name: string;
    attributes?: Array<{
      id: string;
      value_id?: string;
      value_name?: string;
    }>;
  }>>(
    `${API}/sites/MLB/domain_discovery/search?${query.toString()}`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );

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

  const raw = await jsonFetch<{
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
  }>(`${API}/sites/MLB/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

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

/**
 * Camada de marketplaces do Vidalys Radar.
 *
 * Cada marketplace (Mercado Livre hoje, Shopee e outros depois) entrega os
 * mesmos sinais normalizados. A interface nunca inventa valor: quando a API
 * não responde ou não oferece o dado, o sinal vem com status e motivo, e a
 * tela mostra "a confirmar" em vez de zero.
 */

export type MarketplaceId = "MERCADO_LIVRE" | "SHOPEE";

/** Recursos que o produto sabe aproveitar de um marketplace. */
export type MarketplaceCapability =
  | "identity" // título, atributos, GTIN, marca, modelo
  | "price" // preço atual e promoção
  | "quantityPricing" // faixas de preço por quantidade / preço para CNPJ
  | "seller" // reputação pública do vendedor
  | "questions" // perguntas dos compradores
  | "reviews" // opiniões e nota
  | "categoryRequirements" // atributos obrigatórios para anunciar
  | "fees" // tarifa oficial de venda
  | "shipping" // custo de frete oficial
  | "visits" // visitas do anúncio
  | "catalogCompetition" // concorrência no catálogo / buy box
  | "trends" // buscas em alta
  | "ads" // anúncios patrocinados
  | "orders"; // vendas da conta conectada

export type CapabilitySupport = {
  /** EM_USO: o Radar já usa; DISPONIVEL: a API tem e ainda não usamos; NAO_SUPORTADO: a API não oferece. */
  state: "EM_USO" | "DISPONIVEL" | "NAO_SUPORTADO" | "PLANEJADO";
  /** Endpoint(s) oficiais ou o motivo. */
  source: string;
  /** Exige conta do usuário conectada (OAuth) ou só token do aplicativo. */
  auth: "CONTA_CONECTADA" | "APLICATIVO" | "NENHUMA";
};

export type SignalStatus = "OK" | "SEM_DADOS" | "INDISPONIVEL" | "NAO_SUPORTADO";

export type Signal<T> = {
  status: SignalStatus;
  data: T | null;
  /** Texto curto para a interface quando não há dado. */
  reason: string | null;
};

export type QuantityTier = {
  minUnits: number;
  unitPrice: number;
  /** Só vale para compradores com CNPJ (conta empresa). */
  businessOnly: boolean;
};

export type PriceSignal = {
  currency: string;
  consumerPrice: number | null;
  regularPrice: number | null;
  promotion: boolean;
  /** Preço para CNPJ na compra unitária, quando diferente do preço comum. */
  businessPrice: number | null;
  /** Faixas por quantidade, da menor para a maior. */
  tiers: QuantityTier[];
};

export type SellerSignal = {
  id: string;
  nickname: string | null;
  city: string | null;
  state: string | null;
  /** Termômetro (1 a 5) e cor oficial, quando informados. */
  levelScore: number | null;
  levelColor: string | null;
  medal: string | null;
  completedSales: number | null;
  salesPeriod: string | null;
  positiveRate: number | null;
  claimsRate: number | null;
  cancellationsRate: number | null;
  delayedHandlingRate: number | null;
  officialStore: boolean;
  registeredAt: string | null;
  permalink: string | null;
};

export type QuestionTopic =
  | "MEDIDA"
  | "COR_MODELO"
  | "VOLTAGEM"
  | "COMPATIBILIDADE"
  | "QUANTIDADE_ATACADO"
  | "NOTA_FISCAL"
  | "ENTREGA"
  | "GARANTIA_ORIGINAL"
  | "ESTOQUE";

export type QuestionsSignal = {
  total: number | null;
  sampled: number;
  unansweredInSample: number;
  topics: Array<{ topic: QuestionTopic; label: string; count: number }>;
  recent: Array<{ text: string; answered: boolean; date: string | null }>;
};

export type ReviewsSignal = {
  total: number | null;
  average: number | null;
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number } | null;
  recentCritical: Array<{ text: string; rate: number; date: string | null }>;
};

export type CategorySignal = {
  id: string;
  name: string | null;
  path: string[];
  requiredAttributes: Array<{ id: string; name: string }>;
  /** Atributos obrigatórios que o anúncio de referência não informa. */
  missingInReference: Array<{ id: string; name: string }>;
};

export type ListingInsights = {
  marketplace: MarketplaceId;
  listingId: string;
  collectedAt: string;
  price: Signal<PriceSignal>;
  seller: Signal<SellerSignal>;
  questions: Signal<QuestionsSignal>;
  reviews: Signal<ReviewsSignal>;
  category: Signal<CategorySignal>;
};

export type MarketplaceAuth = { accessToken: string | null };

export interface MarketplaceAdapter {
  id: MarketplaceId;
  label: string;
  /** Formato do identificador de anúncio aceito. */
  listingIdPattern: RegExp;
  capabilities: Record<MarketplaceCapability, CapabilitySupport>;
  collectInsights(auth: MarketplaceAuth, listingId: string): Promise<ListingInsights>;
}

export function unavailable<T>(reason: string): Signal<T> {
  return { status: "INDISPONIVEL", data: null, reason };
}

export function unsupported<T>(reason: string): Signal<T> {
  return { status: "NAO_SUPORTADO", data: null, reason };
}

export function ok<T>(data: T): Signal<T> {
  return { status: "OK", data, reason: null };
}

export function empty<T>(reason: string): Signal<T> {
  return { status: "SEM_DADOS", data: null, reason };
}

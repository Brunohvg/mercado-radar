/**
 * Normalização dos sinais públicos do Mercado Livre para o formato comum da
 * camada de marketplaces. Funções puras: sem rede, sem banco, testáveis.
 */
import type {
  CategorySignal,
  PriceSignal,
  QuantityTier,
  QuestionTopic,
  QuestionsSignal,
  ReviewsSignal,
  SellerSignal,
} from "@/lib/marketplaces/types";

type RawPrice = {
  type?: string;
  amount?: number;
  regular_amount?: number | null;
  currency_id?: string;
  conditions?: { context_restrictions?: string[]; min_purchase_unit?: number };
};

const isBusiness = (p: RawPrice) =>
  (p.conditions?.context_restrictions ?? []).some((r) => /business/i.test(r));
const minUnits = (p: RawPrice) => {
  const n = Number(p.conditions?.min_purchase_unit ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
};
const pickRetail = (list: RawPrice[]) =>
  list.find((p) => p.type === "promotion") ?? list.find((p) => p.type === "standard") ?? list[0] ?? null;

/** Preço ao consumidor, preço para CNPJ e faixas por quantidade. */
export function normalizePrices(raw: RawPrice[]): PriceSignal | null {
  const prices = raw.filter((p) => Number(p.amount) > 0);
  if (!prices.length) return null;
  const unit = prices.filter((p) => minUnits(p) <= 1);
  const consumer = pickRetail(unit.filter((p) => !isBusiness(p)));
  const business = pickRetail(unit.filter(isBusiness));
  const standard = unit.find((p) => p.type === "standard" && !isBusiness(p));

  const best = new Map<string, QuantityTier>();
  for (const p of prices) {
    const units = minUnits(p);
    if (units <= 1) continue;
    const tier: QuantityTier = { minUnits: units, unitPrice: Number(p.amount), businessOnly: isBusiness(p) };
    const key = `${units}|${tier.businessOnly}`;
    const prev = best.get(key);
    if (!prev || tier.unitPrice < prev.unitPrice) best.set(key, tier);
  }
  const tiers = [...best.values()].sort(
    (a, b) => a.minUnits - b.minUnits || Number(a.businessOnly) - Number(b.businessOnly),
  );

  const consumerPrice = consumer ? Number(consumer.amount) : null;
  const regular =
    consumer?.type === "promotion"
      ? Number(consumer.regular_amount ?? standard?.amount ?? 0) || null
      : null;
  const businessPrice = business ? Number(business.amount) : null;
  return {
    currency: (consumer ?? prices[0]).currency_id ?? "BRL",
    consumerPrice,
    regularPrice: regular && consumerPrice != null && regular > consumerPrice ? regular : null,
    promotion: consumer?.type === "promotion",
    businessPrice: businessPrice != null && businessPrice !== consumerPrice ? businessPrice : null,
    tiers,
  };
}

const MEDALS: Record<string, string> = {
  platinum: "MercadoLíder Platinum",
  gold: "MercadoLíder Gold",
  silver: "MercadoLíder",
};

type RawUser = {
  id?: number | string;
  nickname?: string;
  registration_date?: string;
  permalink?: string;
  tags?: string[];
  address?: { city?: string | null; state?: string | null };
  seller_reputation?: {
    level_id?: string | null;
    power_seller_status?: string | null;
    transactions?: { completed?: number; period?: string; ratings?: { positive?: number } };
    metrics?: {
      sales?: { period?: string; completed?: number };
      claims?: { rate?: number };
      delayed_handling_time?: { rate?: number };
      cancellations?: { rate?: number };
    };
  };
};

const rate = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

export function normalizeSeller(raw: RawUser): SellerSignal | null {
  if (raw.id == null) return null;
  const rep = raw.seller_reputation ?? {};
  const level = /^([1-5])_([a-z_]+)$/.exec(rep.level_id ?? "");
  const state = raw.address?.state ?? null;
  return {
    id: String(raw.id),
    nickname: raw.nickname ?? null,
    city: raw.address?.city ?? null,
    // A API costuma devolver "BR-SP"; guardamos só a UF.
    state: state ? state.replace(/^BR-/, "") : null,
    levelScore: level ? Number(level[1]) : null,
    levelColor: level ? level[2] : null,
    medal: rep.power_seller_status ? MEDALS[rep.power_seller_status] ?? null : null,
    completedSales: count(rep.metrics?.sales?.completed) ?? count(rep.transactions?.completed),
    salesPeriod: rep.metrics?.sales?.period ?? rep.transactions?.period ?? null,
    positiveRate: rate(rep.transactions?.ratings?.positive),
    claimsRate: rate(rep.metrics?.claims?.rate),
    cancellationsRate: rate(rep.metrics?.cancellations?.rate),
    delayedHandlingRate: rate(rep.metrics?.delayed_handling_time?.rate),
    officialStore: (raw.tags ?? []).includes("brand"),
    registeredAt: raw.registration_date ?? null,
    permalink: raw.permalink ?? null,
  };
}

const TOPICS: Array<{ topic: QuestionTopic; label: string; re: RegExp }> = [
  { topic: "MEDIDA", label: "Medida ou tamanho", re: /\b(medida|tamanho|cm|mm|metro|largura|altura|comprimento|di[aâ]metro|polegada)/i },
  { topic: "COR_MODELO", label: "Cor ou modelo", re: /\b(cor|cores|modelo|estampa|vers[aã]o)\b/i },
  { topic: "VOLTAGEM", label: "Voltagem", re: /\b(110|127|220|bivolt|voltagem|volts?)\b/i },
  { topic: "COMPATIBILIDADE", label: "Compatibilidade", re: /\b(serve|compat[ií]vel|funciona (no|na|com)|encaixa)/i },
  { topic: "QUANTIDADE_ATACADO", label: "Quantidade ou atacado", re: /\b(atacado|quantidade|unidades|kit|caixa com|lote|revenda|desconto)\b/i },
  { topic: "NOTA_FISCAL", label: "Nota fiscal", re: /\b(nota fiscal|nf-?e?|cnpj)\b/i },
  { topic: "ENTREGA", label: "Entrega e frete", re: /\b(entrega|frete|chega|prazo|envio|correios|full)\b/i },
  { topic: "GARANTIA_ORIGINAL", label: "Garantia ou original", re: /\b(garantia|original|lacrad|nacional|importad)/i },
  { topic: "ESTOQUE", label: "Estoque", re: /\b(estoque|dispon[ií]vel|tem (a|o|na|no)|pronta entrega)\b/i },
];

type RawQuestion = { text?: string; status?: string; date_created?: string; answer?: { text?: string } | null };

export function normalizeQuestions(raw: { total?: number; questions?: RawQuestion[] }): QuestionsSignal {
  const questions = (raw.questions ?? []).filter((q) => typeof q.text === "string" && q.text.trim());
  const counts = new Map<QuestionTopic, number>();
  for (const q of questions)
    for (const t of TOPICS) if (t.re.test(q.text!)) counts.set(t.topic, (counts.get(t.topic) ?? 0) + 1);
  const answered = (q: RawQuestion) => Boolean(q.answer?.text) || q.status === "ANSWERED";
  return {
    total: count(raw.total),
    sampled: questions.length,
    unansweredInSample: questions.filter((q) => !answered(q)).length,
    topics: TOPICS.filter((t) => counts.has(t.topic))
      .map((t) => ({ topic: t.topic, label: t.label, count: counts.get(t.topic)! }))
      .sort((a, b) => b.count - a.count),
    recent: questions.slice(0, 5).map((q) => ({
      text: q.text!.trim().slice(0, 280),
      answered: answered(q),
      date: q.date_created ?? null,
    })),
  };
}

const STARS = ["one_star", "two_star", "three_star", "four_star", "five_star"] as const;

export function normalizeReviews(raw: {
  paging?: { total?: number };
  rating_average?: number;
  rating_levels?: Record<string, number>;
  reviews?: Array<{ content?: string; rate?: number; date_created?: string }>;
}): ReviewsSignal {
  const levels = raw.rating_levels;
  const distribution = levels
    ? {
        1: count(levels[STARS[0]]) ?? 0,
        2: count(levels[STARS[1]]) ?? 0,
        3: count(levels[STARS[2]]) ?? 0,
        4: count(levels[STARS[3]]) ?? 0,
        5: count(levels[STARS[4]]) ?? 0,
      }
    : null;
  const total = count(raw.paging?.total);
  const average =
    typeof raw.rating_average === "number" && raw.rating_average > 0 && raw.rating_average <= 5 && total
      ? Math.round(raw.rating_average * 10) / 10
      : null;
  return {
    total,
    average,
    distribution,
    recentCritical: (raw.reviews ?? [])
      .filter((r) => typeof r.rate === "number" && r.rate <= 3 && r.content?.trim())
      .slice(0, 3)
      .map((r) => ({ text: r.content!.trim().slice(0, 280), rate: r.rate!, date: r.date_created ?? null })),
  };
}

export function normalizeCategory(
  category: { id?: string; name?: string; path_from_root?: Array<{ name?: string }> },
  attributes: Array<{ id?: string; name?: string; tags?: Record<string, boolean | undefined> }>,
  referenceAttributeIds: string[],
): CategorySignal | null {
  if (!category.id) return null;
  const filled = new Set(referenceAttributeIds.map((id) => id.toUpperCase()));
  const required = attributes
    .filter((a) => a.id && a.name && (a.tags?.required || a.tags?.catalog_required) && !a.tags?.read_only)
    .map((a) => ({ id: a.id!, name: a.name! }));
  return {
    id: category.id,
    name: category.name ?? null,
    path: (category.path_from_root ?? []).map((p) => p.name ?? "").filter(Boolean),
    requiredAttributes: required,
    missingInReference: required.filter((a) => !filled.has(a.id.toUpperCase())),
  };
}

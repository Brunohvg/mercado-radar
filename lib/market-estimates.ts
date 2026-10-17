/** Public counters are observations, not seller order data. We never derive visits
 * from an assumed conversion rate, sales from reviews, or creation date from IDs.
 * Official orders and changes in exact counters are the only velocity evidence.
 */

export type Range = {
  value: number | null;
  low: number | null;
  high: number | null;
};

export type EstimateMethod = "OFICIAL" | "HISTORICO" | "VIDA" | "PAGINA";

export type Confidence = 0 | 1 | 2 | 3;

export type Observation = {
  at: Date;
  price?: number | null;
  soldLower?: number | null;
  soldUpper?: number | null;
  soldExact?: number | null;
  reviews?: number | null;
  visitsTotal?: number | null;
};

export type AgeHint = {
  days: number;
  source: "API" | "ID_ESTIMADO";
};

export type Calibration = {
  conversion: {
    value: number;
    low: number;
    high: number;
    source: "SUA_CONTA" | "PADRAO";
    sample: number;
  };
  soldPerReview: { value: number; low: number; high: number; sample: number };
};

export type OfficialFacts = {
  /** unidades vendidas nos últimos `windowDays` dias (pedidos reais) */
  unitsInWindow?: number | null;
  windowDays?: number;
  /** visitas nos últimos `windowDays` dias, se conhecidas */
  visitsInWindow?: number | null;
};

export type ItemEstimate = {
  method: EstimateMethod;
  confidence: Confidence;
  salesPerDay: Range;
  revenuePerDay: Range;
  visitsPerDay: Range;
  conversion: { value: number; source: "SUA_CONTA" | "PADRAO" | "OFICIAL" };
  sold: { lower: number | null; upper: number | null; exact: boolean };
  ageDays: { value: number | null; source: AgeHint["source"] | null };
  windowDays: number | null;
  observations: number;
  basis: string[];
};

export const DEFAULT_CALIBRATION: Calibration = {
  conversion: {
    value: 0.025,
    low: 0.012,
    high: 0.05,
    source: "PADRAO",
    sample: 0,
  },
  soldPerReview: { value: 28, low: 12, high: 60, sample: 0 },
};

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ */
/* faixa de "vendidos" exibida pelo Mercado Livre                      */
/* ------------------------------------------------------------------ */

export function soldRangeFromLabel(
  lower: number | null | undefined,
  hasPlus: boolean,
) {
  if (lower == null || !Number.isFinite(lower) || lower < 0) {
    return { lower: null, upper: null };
  }
  if (!hasPlus) return { lower, upper: lower };
  return { lower, upper: null };
}

/* ------------------------------------------------------------------ */
/* idade pelo número do anúncio                                        */
/* ------------------------------------------------------------------ */

export type IdAnchor = { id: number; at: number };

/** Número do anúncio sem o prefixo (MLB1234567890 → 1234567890). */
export function itemNumber(itemId: string) {
  const match = /^MLB(\d{6,})$/i.exec(itemId.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Os IDs MLB são sequenciais no tempo. Com âncoras conhecidas (anúncios cuja
 * data de criação veio da API), interpolamos a data de qualquer outro ID.
 * Âncoras que quebram a ordem temporal são descartadas. Exige 3 âncoras e
 * não extrapola mais do que 25% da extensão conhecida.
 */
export function buildIdDateModel(anchors: IdAnchor[]) {
  const sorted = [...anchors]
    .filter((a) => Number.isFinite(a.id) && Number.isFinite(a.at))
    .sort((a, b) => a.id - b.id);

  const clean: IdAnchor[] = [];
  for (const anchor of sorted) {
    const last = clean[clean.length - 1];
    if (!last || anchor.at >= last.at - 30 * DAY_MS) clean.push(anchor);
  }

  if (clean.length < 3) return null;

  const first = clean[0];
  const last = clean[clean.length - 1];
  const span = last.id - first.id;
  if (span <= 0 || last.at <= first.at) return null;

  return function estimateCreatedAt(id: number): number | null {
    if (id < first.id - span * 0.25 || id > last.id + span * 0.25) return null;

    let left = first;
    let right = last;
    if (id <= first.id) {
      left = clean[0];
      right = clean[1];
    } else if (id >= last.id) {
      left = clean[clean.length - 2];
      right = clean[clean.length - 1];
    } else {
      for (let i = 1; i < clean.length; i += 1) {
        if (clean[i].id >= id) {
          left = clean[i - 1];
          right = clean[i];
          break;
        }
      }
    }

    if (right.id === left.id) return left.at;
    const ratio = (id - left.id) / (right.id - left.id);
    return left.at + ratio * (right.at - left.at);
  };
}

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function geo(low: number, high: number) {
  if (low <= 0) return high / 2;
  return Math.sqrt(low * high);
}

function round(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function range(
  value: number | null,
  low: number | null,
  high: number | null,
  digits = 2,
): Range {
  return {
    value: round(value, digits),
    low: round(low, digits),
    high: round(high, digits),
  };
}

const EMPTY: Range = { value: null, low: null, high: null };

function scaleRange(r: Range, factor: number | null, digits = 2): Range {
  if (factor == null || !Number.isFinite(factor) || r.value == null)
    return EMPTY;
  return range(
    r.value * factor,
    (r.low ?? r.value) * factor,
    (r.high ?? r.value) * factor,
    digits,
  );
}

function fmt(n: number, digits = 1) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

export function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function quantile(values: number[], q: number) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/* ------------------------------------------------------------------ */
/* estimativa de um anúncio                                            */
/* ------------------------------------------------------------------ */

export function estimateItem(input: {
  observations: Observation[];
  price: number | null;
  age: AgeHint | null;
  calibration?: Calibration;
  official?: OfficialFacts | null;
  now?: Date;
}): ItemEstimate {
  const calibration = input.calibration ?? DEFAULT_CALIBRATION;
  const now = input.now ?? new Date();
  const obs = [...input.observations]
    .filter((o) => o.at instanceof Date && !Number.isNaN(o.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const latest = obs[obs.length - 1] ?? null;
  const price = input.price ?? latest?.price ?? null;
  const basis: string[] = [];

  const exact = latest?.soldExact ?? null;
  const soldLower = exact ?? latest?.soldLower ?? null;
  const soldUpper = exact ?? latest?.soldUpper ?? null;
  const sold = { lower: soldLower, upper: soldUpper, exact: exact != null };
  // Idade estimada pelo número do anúncio tem erro de dias: abaixo de 14 dias
  // ela inflaria demais o ritmo (ex.: "+5000 vendidos" em "1 dia").
  const ageDays =
    input.age?.source === "API" ? Math.max(1, input.age.days) : null;

  const base = {
    sold,
    ageDays: {
      value: ageDays == null ? null : Math.round(ageDays),
      source: input.age?.source ?? null,
    },
    observations: obs.length,
  };

  /* ---------- OFICIAL: pedidos reais da própria conta ---------- */
  const official = input.official;
  if (official?.unitsInWindow != null && (official.windowDays ?? 0) > 0) {
    const days = official.windowDays!;
    const perDay = official.unitsInWindow / days;
    const sales = range(perDay, perDay, perDay);
    let visits: Range = EMPTY;
    let conversion: ItemEstimate["conversion"] = {
      value: calibration.conversion.value,
      source: calibration.conversion.source,
    };

    if (official.visitsInWindow != null && official.visitsInWindow > 0) {
      const v = official.visitsInWindow / days;
      visits = range(v, v, v, 1);
      conversion = {
        value: official.unitsInWindow / official.visitsInWindow,
        source: "OFICIAL",
      };
      basis.push(
        `${fmt(official.visitsInWindow, 0)} visitas oficiais em ${days} dias.`,
      );
    }

    basis.unshift(
      `${fmt(official.unitsInWindow, 0)} unidades vendidas em ${days} dias (pedidos da sua conta).`,
    );

    return {
      ...base,
      method: "OFICIAL",
      confidence: 3,
      salesPerDay: sales,
      revenuePerDay: scaleRange(sales, price),
      visitsPerDay: visits,
      conversion,
      windowDays: days,
      basis,
    };
  }

  /* ---------- HISTÓRICO: diferença entre leituras ---------- */
  const history = estimateFromHistory(obs, calibration, now);
  if (history) {
    basis.push(...history.basis);
    const visits = EMPTY;
    return {
      ...base,
      method: "HISTORICO",
      confidence: history.confidence,
      salesPerDay: history.sales,
      revenuePerDay: scaleRange(history.sales, price),
      visitsPerDay: visits,
      conversion: {
        value: calibration.conversion.value,
        source: calibration.conversion.source,
      },
      windowDays: round(history.windowDays, 1),
      basis,
    };
  }

  /* ---------- VIDA: acumulado ÷ idade ---------- */
  if (ageDays != null && soldLower != null && soldUpper != null) {
    const low = soldLower / ageDays;
    const high = soldUpper / ageDays;
    const sales = range(exact != null ? low : geo(low, high), low, high);
    basis.push(
      exact != null
        ? `${fmt(exact, 0)} vendidos em ${fmt(ageDays, 0)} dias de anúncio.`
        : `Entre ${fmt(soldLower, 0)} e ${fmt(soldUpper, 0)} vendidos em ${fmt(ageDays, 0)} dias de anúncio.`,
    );
    basis.push(
      input.age?.source === "API"
        ? "Idade do anúncio informada pelo Mercado Livre."
        : "Idade do anúncio estimada pelo número do anúncio (os números são sequenciais no tempo).",
    );
    basis.push(
      "Média desde a criação: anúncios que aceleraram ou esfriaram ficam suavizados até o Radar ter histórico.",
    );

    return {
      ...base,
      method: "VIDA",
      confidence: 1,
      salesPerDay: sales,
      revenuePerDay: scaleRange(sales, price),
      visitsPerDay: EMPTY,
      conversion: {
        value: calibration.conversion.value,
        source: calibration.conversion.source,
      },
      windowDays: null,
      basis,
    };
  }

  /* ---------- PÁGINA: só o acumulado ---------- */
  if (soldLower != null) {
    basis.push(`A página mostra ${fmt(soldLower, 0)}+ vendidos no total.`);
  }
  basis.push(
    "O acumulado não informa ritmo de vendas. Avaliações não são convertidas em vendas ou visitas; acompanhe a evolução de preço por novas leituras.",
  );

  return {
    ...base,
    method: "PAGINA",
    confidence: 0,
    salesPerDay: EMPTY,
    revenuePerDay: EMPTY,
    visitsPerDay: EMPTY,
    conversion: {
      value: calibration.conversion.value,
      source: calibration.conversion.source,
    },
    windowDays: null,
    basis,
  };
}

function estimateFromHistory(
  obs: Observation[],
  _calibration: Calibration,
  now: Date,
) {
  const exact = obs.filter(
    (o) => o.soldExact != null && now.getTime() - o.at.getTime() <= 45 * DAY_MS,
  );
  const last = exact.at(-1);
  if (!last) return null;
  const first = exact.find(
    (o) => last.at.getTime() - o.at.getTime() >= 2 * DAY_MS,
  );
  if (!first || last.soldExact! < first.soldExact!) return null;
  const days = (last.at.getTime() - first.at.getTime()) / DAY_MS;
  const delta = last.soldExact! - first.soldExact!;
  const rate = delta / days;
  return {
    sales: range(rate, rate, rate),
    windowDays: days,
    confidence: 2 as Confidence,
    basis: [
      `Contador exato aumentou ${fmt(delta, 0)} unidades em ${fmt(days)} dias.`,
      "Média observada entre leituras; não é previsão nem relatório mensal.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* score e demanda a partir da estimativa                              */
/* ------------------------------------------------------------------ */

export type DemandLabel = "BAIXA" | "MEDIA" | "ALTA" | "EXCELENTE";

export function demandFrom(estimate: ItemEstimate): DemandLabel | null {
  const perDay = estimate.salesPerDay.value;
  if (perDay != null) {
    if (perDay >= 10) return "EXCELENTE";
    if (perDay >= 3) return "ALTA";
    if (perDay >= 0.7) return "MEDIA";
    return "BAIXA";
  }
  return null;
}

export function marketScore(input: {
  estimate: ItemEstimate;
  rating?: number | null;
  freeShipping?: boolean;
  fulfillment?: boolean;
}) {
  const { estimate } = input;
  const perDay = estimate.salesPerDay.value;
  const revenue = estimate.revenuePerDay.value;
  if (perDay == null) return null;
  const sold = estimate.sold.lower ?? 0;

  const velocity =
    perDay == null
      ? null
      : clamp((Math.log10(perDay + 1) / Math.log10(51)) * 100, 0, 100);
  const money =
    revenue == null
      ? null
      : clamp((Math.log10(revenue + 1) / Math.log10(20_001)) * 100, 0, 100);
  const proof = clamp((Math.log10(sold + 1) / 4.5) * 100, 0, 100);
  const rating =
    input.rating == null
      ? 50
      : clamp(((input.rating - 3.5) / 1.5) * 100, 0, 100);
  const logistics = input.fulfillment ? 100 : input.freeShipping ? 70 : 40;

  const score =
    velocity != null && money != null
      ? velocity * 0.4 +
        money * 0.2 +
        proof * 0.2 +
        rating * 0.1 +
        logistics * 0.1
      : 0;

  return Math.round(clamp(score, 0, 100));
}

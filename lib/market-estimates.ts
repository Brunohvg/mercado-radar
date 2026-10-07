/**
 * Modelo de estimativa do Mercado Radar (funções puras, sem banco nem rede).
 *
 * Por que existe: com um token comum, a API do Mercado Livre não entrega
 * vendas, estoque nem visitas de anúncios de outros vendedores. O que a página
 * mostra a qualquer comprador é: preço, faixa de vendidos ("+1000 vendidos"),
 * número de avaliações e nota. Este módulo transforma leituras datadas desses
 * sinais em vendas/dia, faturamento/dia e visitas/dia, SEMPRE com intervalo e
 * dizendo de onde veio cada número.
 *
 * Métodos, do mais forte para o mais fraco:
 *  - OFICIAL   anúncio da própria conta: pedidos reais (ou vendidos exatos da
 *              API) e visitas da API.
 *  - HISTORICO duas ou mais leituras do mesmo anúncio separadas no tempo:
 *              Δavaliações/Δdias × (vendidos por avaliação do próprio anúncio),
 *              cruzado com a mudança de faixa de vendidos quando houver.
 *  - VIDA      uma leitura só: vendidos acumulados ÷ idade do anúncio
 *              (idade da API ou estimada pelo número do anúncio).
 *  - PAGINA    sem idade nem histórico: só o acumulado que a página mostra.
 *
 * Visitas/dia de terceiros = vendas/dia ÷ conversão. A conversão é calibrada
 * com os anúncios da própria conta (visitas e vendas oficiais); sem eles, usa
 * uma faixa padrão de mercado e diz isso.
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
  conversion: { value: number; low: number; high: number; source: "SUA_CONTA" | "PADRAO"; sample: number };
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
  conversion: { value: 0.025, low: 0.012, high: 0.05, source: "PADRAO", sample: 0 },
  soldPerReview: { value: 28, low: 12, high: 60, sample: 0 },
};

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ */
/* faixa de "vendidos" exibida pelo Mercado Livre                      */
/* ------------------------------------------------------------------ */

/**
 * Degraus que o Mercado Livre usa em "+N vendidos". O limite superior real de
 * uma faixa é o próximo degrau (exclusivo). Se o número não estiver na
 * escada, assumimos o dobro como teto conservador.
 */
const SOLD_LADDER = [
  5, 10, 25, 50, 100, 150, 200, 250, 500, 1_000, 2_000, 5_000, 10_000, 25_000,
  50_000, 100_000, 500_000, 1_000_000, 5_000_000,
];

export function soldRangeFromLabel(lower: number | null | undefined, hasPlus: boolean) {
  if (lower == null || !Number.isFinite(lower) || lower < 0) {
    return { lower: null, upper: null };
  }
  if (!hasPlus) return { lower, upper: lower };
  const next = SOLD_LADDER.find((step) => step > lower);
  return { lower, upper: next ?? lower * 2 };
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

function range(value: number | null, low: number | null, high: number | null, digits = 2): Range {
  return { value: round(value, digits), low: round(low, digits), high: round(high, digits) };
}

const EMPTY: Range = { value: null, low: null, high: null };

function scaleRange(r: Range, factor: number | null, digits = 2): Range {
  if (factor == null || !Number.isFinite(factor) || r.value == null) return EMPTY;
  return range(r.value * factor, (r.low ?? r.value) * factor, (r.high ?? r.value) * factor, digits);
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
  const soldUpper = exact ?? latest?.soldUpper ?? latest?.soldLower ?? null;
  const sold = { lower: soldLower, upper: soldUpper, exact: exact != null };
  // Idade estimada pelo número do anúncio tem erro de dias: abaixo de 14 dias
  // ela inflaria demais o ritmo (ex.: "+5000 vendidos" em "1 dia").
  const ageDays = input.age
    ? Math.max(input.age.source === "ID_ESTIMADO" ? 14 : 1, input.age.days)
    : null;

  const base = {
    sold,
    ageDays: { value: ageDays == null ? null : Math.round(ageDays), source: input.age?.source ?? null },
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
      conversion = { value: official.unitsInWindow / official.visitsInWindow, source: "OFICIAL" };
      basis.push(`${fmt(official.visitsInWindow, 0)} visitas oficiais em ${days} dias.`);
    } else if (perDay > 0) {
      visits = range(
        perDay / calibration.conversion.value,
        perDay / calibration.conversion.high,
        perDay / calibration.conversion.low,
        1,
      );
    }

    basis.unshift(`${fmt(official.unitsInWindow, 0)} unidades vendidas em ${days} dias (pedidos da sua conta).`);

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
    const visits = visitsFromSales(history.sales, calibration);
    basis.push(conversionNote(calibration));
    return {
      ...base,
      method: "HISTORICO",
      confidence: history.confidence,
      salesPerDay: history.sales,
      revenuePerDay: scaleRange(history.sales, price),
      visitsPerDay: visits,
      conversion: { value: calibration.conversion.value, source: calibration.conversion.source },
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
    basis.push("Média desde a criação: anúncios que aceleraram ou esfriaram ficam suavizados até o Radar ter histórico.");
    basis.push(conversionNote(calibration));

    return {
      ...base,
      method: "VIDA",
      confidence: 1,
      salesPerDay: sales,
      revenuePerDay: scaleRange(sales, price),
      visitsPerDay: visitsFromSales(sales, calibration),
      conversion: { value: calibration.conversion.value, source: calibration.conversion.source },
      windowDays: null,
      basis,
    };
  }

  /* ---------- PÁGINA: só o acumulado ---------- */
  if (soldLower != null) {
    basis.push(`A página mostra ${fmt(soldLower, 0)}+ vendidos no total.`);
  }
  basis.push("Ainda sem histórico nem idade do anúncio. Abra este anúncio de novo em alguns dias para o Radar medir o ritmo.");

  return {
    ...base,
    method: "PAGINA",
    confidence: 0,
    salesPerDay: EMPTY,
    revenuePerDay: EMPTY,
    visitsPerDay: EMPTY,
    conversion: { value: calibration.conversion.value, source: calibration.conversion.source },
    windowDays: null,
    basis,
  };
}

function conversionNote(calibration: Calibration) {
  const c = calibration.conversion;
  return c.source === "SUA_CONTA"
    ? `Visitas = vendas ÷ conversão de ${fmt(c.value * 100)}% (mediana de ${c.sample} anúncios seus).`
    : `Visitas = vendas ÷ conversão típica de ${fmt(c.low * 100)}% a ${fmt(c.high * 100)}%. Conecte e sincronize seus anúncios para calibrar com seus números.`;
}

function visitsFromSales(sales: Range, calibration: Calibration): Range {
  if (sales.value == null) return EMPTY;
  const c = calibration.conversion;
  return range(
    sales.value / c.value,
    (sales.low ?? sales.value) / c.high,
    (sales.high ?? sales.value) / c.low,
    1,
  );
}

function estimateFromHistory(obs: Observation[], calibration: Calibration, now: Date) {
  const recent = obs.filter((o) => now.getTime() - o.at.getTime() <= 90 * DAY_MS);
  const withReviews = recent.filter((o) => o.reviews != null);
  if (withReviews.length < 2) return null;

  const latest = withReviews[withReviews.length - 1];
  // janela: a leitura mais antiga dentro de 45 dias, com pelo menos 2 dias de distância
  const startCandidates = withReviews.filter(
    (o) =>
      latest.at.getTime() - o.at.getTime() >= 2 * DAY_MS &&
      latest.at.getTime() - o.at.getTime() <= 45 * DAY_MS,
  );
  const start = startCandidates[0];
  if (!start) return null;

  const days = (latest.at.getTime() - start.at.getTime()) / DAY_MS;
  const deltaReviews = Math.max(0, (latest.reviews ?? 0) - (start.reviews ?? 0));

  // vendidos por avaliação: do próprio anúncio (faixa ÷ avaliações), senão calibrado
  const reviews = latest.reviews ?? 0;
  const lower = latest.soldExact ?? latest.soldLower ?? null;
  const upper = latest.soldExact ?? latest.soldUpper ?? null;
  let ratioLow = calibration.soldPerReview.low;
  let ratioHigh = calibration.soldPerReview.high;
  let ratioSource = "típica";

  if (reviews >= 5 && lower != null && upper != null) {
    // Sem piso artificial: em anúncios de catálogo as avaliações são do produto
    // (somam todos os vendedores), e a razão vendidos÷avaliações deste anúncio
    // já converte o ritmo do produto na fatia deste anúncio.
    ratioLow = clamp(lower / reviews, 0.05, 250);
    ratioHigh = clamp(upper / reviews, ratioLow, 300);
    ratioSource = "deste anúncio";
  }

  const basis: string[] = [];
  let low: number;
  let high: number;

  if (deltaReviews > 0) {
    low = (deltaReviews / days) * ratioLow;
    high = (deltaReviews / days) * ratioHigh;
    basis.push(
      `+${fmt(deltaReviews, 0)} avaliações em ${fmt(days)} dias, com ${fmt(ratioLow, 0)}–${fmt(ratioHigh, 0)} vendas por avaliação (razão ${ratioSource}).`,
    );
  } else {
    // nenhuma avaliação nova: menos de 1 avaliação no período
    low = 0;
    high = (1 / days) * ratioHigh;
    basis.push(`Nenhuma avaliação nova em ${fmt(days)} dias: ritmo baixo no período.`);
  }

  // mudança de faixa de vendidos entre as leituras reforça/limita o intervalo
  const startLower = start.soldExact ?? start.soldLower ?? null;
  const startUpper = start.soldExact ?? start.soldUpper ?? null;
  if (lower != null && upper != null && startLower != null && startUpper != null) {
    const minDelta = Math.max(0, lower - startUpper) / days;
    const maxDelta = Math.max(0, upper - startLower) / days;
    if (maxDelta > 0) {
      if (minDelta > high) {
        // a mudança de faixa prova mais vendas do que as avaliações sugerem: vale a faixa
        low = minDelta;
        high = Math.max(maxDelta, minDelta);
      } else if (maxDelta >= low) {
        low = Math.max(low, minDelta);
        high = Math.min(high, maxDelta);
      }
      if (lower !== startLower) {
        basis.push(`Faixa de vendidos passou de ${fmt(startLower, 0)}+ para ${fmt(lower, 0)}+ no período.`);
      }
    }
  }

  if (high < low) high = low;
  const raw = deltaReviews > 0 || low > 0 ? geo(low, high) : high / 3;
  const value = clamp(raw, low, high);

  const confidence: Confidence = deltaReviews >= 3 && days >= 5 ? 2 : 1;

  basis.push(`${withReviews.length} leituras do Radar entre ${start.at.toLocaleDateString("pt-BR")} e ${latest.at.toLocaleDateString("pt-BR")}.`);

  return {
    sales: range(value, low, high),
    windowDays: days,
    confidence,
    basis,
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
  const sold = estimate.sold.lower;
  if (sold == null) return null;
  if (sold >= 5000) return "ALTA";
  if (sold >= 500) return "MEDIA";
  return "BAIXA";
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
  const sold = estimate.sold.lower ?? 0;

  const velocity = perDay == null ? null : clamp((Math.log10(perDay + 1) / Math.log10(51)) * 100, 0, 100);
  const money = revenue == null ? null : clamp((Math.log10(revenue + 1) / Math.log10(20_001)) * 100, 0, 100);
  const proof = clamp((Math.log10(sold + 1) / 4.5) * 100, 0, 100);
  const rating =
    input.rating == null ? 50 : clamp(((input.rating - 3.5) / 1.5) * 100, 0, 100);
  const logistics = input.fulfillment ? 100 : input.freeShipping ? 70 : 40;

  const score =
    velocity != null && money != null
      ? velocity * 0.4 + money * 0.2 + proof * 0.2 + rating * 0.1 + logistics * 0.1
      : // sem ritmo medido: só prova acumulada, com teto (não compete com quem foi medido)
        Math.min(60, proof * 0.7 + rating * 0.15 + logistics * 0.15);

  return Math.round(clamp(score, 0, 100));
}

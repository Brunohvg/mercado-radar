/** One public-market reading for the web app and the extension.
 * Historical volume is a screening heuristic, never a recent sales estimate.
 * A lower bound stays a lower bound; reviews never become sales.
 */
export type MarketLevel = "BAIXA" | "MEDIA" | "ALTA" | "EXCELENTE";
export type MarketTone = "neutral" | "good" | "warn" | "bad";
type Estimate = {
  method?: string;
  windowDays?: number | null;
  salesPerDay?: { value?: number | null };
  ageDays?: { value?: number | null; source?: string | null };
  sold?: { lower?: number | null; exact?: boolean };
};
export type PublicProduct = {
  id?: string;
  price?: number | null;
  soldLower?: number | null;
  soldHasPlus?: boolean;
  bestSellerLabel?: string | null;
  rating?: number | null;
  reviews?: number | null;
};
export type MarketInsight = PublicProduct & {
  isOwn?: boolean;
  estimate?: Estimate;
};
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const count = (value: unknown): value is number =>
  finite(value) && Number.isSafeInteger(value) && value >= 0;
const numberFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});
const compactFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});
const preciseFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const number = (value: number) => numberFormat.format(value);
const names: Record<MarketLevel, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  EXCELENTE: "Excelente",
};
export function rateLevel(rate: number): MarketLevel {
  return rate >= 10
    ? "EXCELENTE"
    : rate >= 3
      ? "ALTA"
      : rate >= 0.7
        ? "MEDIA"
        : "BAIXA";
}
export function volumeLevel(sold: number): MarketLevel {
  return sold >= 5000
    ? "EXCELENTE"
    : sold >= 500
      ? "ALTA"
      : sold >= 100
        ? "MEDIA"
        : "BAIXA";
}
export function measuredDemand(insight?: MarketInsight | null) {
  const e = insight?.estimate,
    rate = e?.salesPerDay?.value;
  const dated =
    ["OFICIAL", "HISTORICO"].includes(e?.method ?? "") &&
    finite(e?.windowDays) &&
    e.windowDays >= 1;
  const lifetime =
    e?.method === "VIDA" &&
    e.sold?.exact === true &&
    e.ageDays?.source === "API" &&
    finite(e.ageDays.value) &&
    e.ageDays.value >= 1;
  if (
    !finite(rate) ||
    rate < 0 ||
    (!dated && !lifetime) ||
    (e?.method === "OFICIAL" && insight?.isOwn !== true)
  ) {
    return {
      level: null,
      title: "Demanda a confirmar",
      tone: "neutral" as MarketTone,
      rate: null,
      basis:
        "Vendidos acumulados e avaliações não informam vendas por período.",
    };
  }
  const level = rateLevel(rate);
  const title =
    level === "ALTA"
      ? "Alta demanda"
      : level === "BAIXA"
        ? "Baixa demanda"
        : "Demanda " + names[level].toLowerCase();
  return {
    level,
    title: title + (lifetime ? " · histórica" : ""),
    tone: (level === "BAIXA"
      ? "warn"
      : level === "MEDIA"
        ? "neutral"
        : "good") as MarketTone,
    rate,
    basis: lifetime
      ? "Média desde a criação oficial; não mede a demanda recente."
      : e?.method === "OFICIAL"
        ? `Pedidos da sua conta · últimos ${number(e.windowDays!)} dias.`
        : `Contador exato entre leituras · ${number(e!.windowDays!)} dias.`,
  };
}

/** Compact minimums round down so ≥ never overstates the observed floor. */
export function compactMoney(value: number, lowerBound = false) {
  if (!finite(value)) return "—";
  const scale = Math.abs(value) >= 1e6 ? 1e6 : Math.abs(value) >= 1e3 ? 1e3 : 1;
  const digits = scale === 1 ? 2 : 1;
  const factor = 10 ** digits;
  const scaled = lowerBound
    ? Math.floor((value / scale) * factor + 1e-8) / factor
    : value / scale;
  const text = (scale === 1 ? preciseFormat : compactFormat).format(scaled);
  return (
    (lowerBound ? "≥ " : "") +
    "R$ " +
    text +
    (scale === 1e6 ? " mi" : scale === 1e3 ? " mil" : "")
  );
}

export function assessMarket(
  product: PublicProduct,
  candidate?: MarketInsight | null,
) {
  // An insight from a previous card/page must never leak into this product.
  const insight =
    candidate && (!product.id || candidate.id === product.id)
      ? candidate
      : null;
  const measured = measuredDemand(insight);
  const e = insight?.estimate;
  const sold = count(product.soldLower)
    ? product.soldLower
    : count(e?.sold?.lower)
      ? e.sold.lower
      : null;
  const lowerBound = count(product.soldLower)
    ? product.soldHasPlus === true
    : e?.sold?.exact !== true;
  const soldText =
    sold == null
      ? "Vendas não informadas"
      : number(sold) + (lowerBound ? "+" : "") + " vendidos";
  const historicalLevel = sold == null ? null : volumeLevel(sold);
  const level = measured.level ?? historicalLevel;
  const basis = measured.level
    ? measured.basis
    : sold == null
      ? product.bestSellerLabel
        ? `Selo da página: ${product.bestSellerLabel}. Não informa vendas por dia.`
        : "Sem contador público de vendas; avaliações não substituem vendas."
      : `${soldText} no acumulado. Triagem por volume: até 99 inicial, 100–499 médio, 500–4.999 alto, 5.000+ excelente. ${lowerBound ? "Faixa mínima; o total real pode ser maior. " : ""}Sem período, não mede o giro recente.`;
  const demand = {
    level,
    text: level
      ? names[level]
      : product.bestSellerLabel
        ? "Mais vendido"
        : "A confirmar",
    label: measured.level
      ? e?.method === "VIDA"
        ? "demanda média histórica"
        : "demanda medida"
      : "demanda histórica",
    basis,
    rate: measured.rate,
    historical: !measured.level || e?.method === "VIDA",
    lowerBound: !measured.level && lowerBound && sold != null,
  };
  const recent = measured.level != null && e?.method !== "VIDA";
  let potential: {
    key: string;
    title: string;
    tone: MarketTone;
    rank: number;
    reason: string;
  };
  if (recent && level === "BAIXA")
    potential = {
      key: "caution",
      title: "Pouco giro",
      tone: "warn",
      rank: 1,
      reason: measured.basis + " Menos de 0,7 venda/dia no período medido.",
    };
  else if (level === "EXCELENTE" || level === "ALTA")
    potential = {
      key: "favorable",
      title: level === "EXCELENTE" ? "Potencial forte" : "Bom potencial",
      tone: "good",
      rank: level === "EXCELENTE" ? 5 : 4,
      reason: recent
        ? "Ritmo recente favorável. Simule seu custo para decidir a entrada."
        : "Volume histórico relevante. Confirme o giro recente e simule seu custo antes de comprar estoque.",
    };
  else if (level === "MEDIA")
    potential = {
      key: "moderate",
      title: "Potencial moderado",
      tone: "neutral",
      rank: 3,
      reason: recent
        ? "Ritmo intermediário no período. Avalie margem e concorrência."
        : "Volume histórico intermediário. O total pode crescer; falta confirmar o período e a sua margem.",
    };
  else if (level === "BAIXA")
    potential = {
      key: "initial",
      title: "Em formação",
      tone: "neutral",
      rank: 2,
      reason:
        "Poucas vendas no contador disponível. Pode ser um anúncio novo; isso não comprova baixa demanda atual.",
    };
  else
    potential = {
      key: "unknown",
      title: product.bestSellerLabel
        ? "Interesse sinalizado"
        : "Dados parciais",
      tone: "neutral",
      rank: 0,
      reason: product.bestSellerLabel
        ? "A página exibe um selo de mais vendido. Falta volume com período para medir o giro."
        : "Sem quantidade vendida disponível. Compare preço e oferta; a demanda ainda precisa de evidência.",
    };
  if (
    finite(product.rating) &&
    product.rating < 4 &&
    count(product.reviews) &&
    product.reviews >= 10
  ) {
    potential = {
      ...potential,
      key: "caution",
      title: "Atenção à qualidade",
      tone: "warn",
      rank: 1,
      reason:
        "Nota abaixo de 4 com pelo menos 10 avaliações. Confira as reclamações antes de escolher o fornecedor. " +
        potential.reason,
    };
  }
  const price =
    finite(product.price) && product.price > 0 ? product.price : null;
  const cents =
    price != null && sold != null ? Math.round(price * 100) * sold : null;
  const reference =
    cents != null && Number.isSafeInteger(cents)
      ? {
          value: cents / 100,
          lowerBound,
          text: compactMoney(cents / 100, lowerBound),
          label: "receita de referência",
          basis: soldText + " × preço atual",
          detail:
            "Projeção bruta do acumulado ao preço atual. O valor das vendas passadas e o período não são conhecidos. Não é faturamento recebido nem lucro.",
        }
      : null;
  return { demand, measured, potential, reference, sold, soldText, recent };
}

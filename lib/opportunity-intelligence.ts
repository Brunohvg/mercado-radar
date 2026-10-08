export type SearchOpportunityInput = {
  price: number;
  medianPrice: number | null;
  searchPosition: number;
  soldQuantity: number;
  visits: number | null;
  dateCreated: string | null;
  freeShipping: boolean;
  logisticType: string | null;
  catalogProductId: string | null;
  listingTypeId: string | null;
  similarity: number;
  /** ritmo medido pelo Radar (histórico/oficial) para este anúncio, se houver */
  measuredSalesPerDay?: number | null;
  measuredVisitsPerDay?: number | null;
};

export type SearchOpportunityScore = {
  total: number;
  /** null quando não há vendas nem idade para medir demanda (não inventamos). */
  demandLabel: "BAIXA" | "MEDIA" | "ALTA" | "EXCELENTE" | null;
  /** true quando o score não enxerga vendas: nota parcial, teto 60. */
  partial: boolean;
  evidence: "LOW" | "MEDIUM" | "HIGH";
  salesPerDay: number | null;
  salesPerMonth: number | null;
  visitsPerDay: number | null;
  revenuePerDay: number | null;
  revenuePerMonth: number | null;
  ageDays: number | null;
  /** como o ritmo foi obtido: MEDIDO (leituras do Radar) | VIDA (vendidos ÷ idade) | null */
  rhythm: "MEDIDO" | "VIDA" | null;
  components: {
    demand: number;
    velocity: number;
    relevance: number;
    price: number;
    logistics: number;
    evidence: number;
  };
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

const round1 = (value: number) =>
  Math.round((value + Number.EPSILON) * 10) / 10;

function safeAgeDays(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(1, Math.floor((Date.now() - timestamp) / 86_400_000));
}

export function calculateSearchOpportunityScore(
  input: SearchOpportunityInput,
): SearchOpportunityScore {
  const ageDays = safeAgeDays(input.dateCreated);
  const soldQuantity = Math.max(0, Number(input.soldQuantity || 0));
  const visits =
    input.visits == null ? null : Math.max(0, Number(input.visits));

  const measured =
    input.measuredSalesPerDay != null && input.measuredSalesPerDay >= 0
      ? input.measuredSalesPerDay
      : null;
  const salesPerDay =
    measured ??
    (ageDays != null && soldQuantity > 0 ? soldQuantity / ageDays : null);
  const salesPerMonth =
    salesPerDay == null ? null : salesPerDay * 30;
  const visitsPerDay =
    input.measuredVisitsPerDay != null
      ? input.measuredVisitsPerDay
      : ageDays != null && visits != null
        ? visits / ageDays
        : null;
  const revenuePerDay =
    salesPerDay == null
      ? null
      : salesPerDay * Math.max(0, input.price);
  const revenuePerMonth =
    salesPerMonth == null
      ? null
      : salesPerMonth * Math.max(0, input.price);

  const demand = clamp(
    salesPerMonth == null
      ? 0
      : (Math.log10(salesPerMonth + 1) / 2.35) * 100,
  );

  const velocity = clamp(
    soldQuantity <= 0
      ? 0
      : (Math.log10(soldQuantity + 1) / 4.2) * 100,
  );

  const relevance = clamp(input.similarity * 100);

  let price = 55;
  if (input.medianPrice != null && input.medianPrice > 0 && input.price > 0) {
    const gap = (input.price - input.medianPrice) / input.medianPrice;
    price =
      gap <= -0.15
        ? 82
        : gap <= 0
          ? 72
          : gap <= 0.1
            ? 58
            : gap <= 0.25
              ? 42
              : 24;
  }

  const logistics = clamp(
    (input.freeShipping ? 48 : 30) +
      (input.logisticType === "fulfillment"
        ? 28
        : input.logisticType === "self_service"
          ? 20
          : 8) +
      (input.catalogProductId ? 14 : 0) +
      (input.listingTypeId === "gold_pro" ? 10 : 5),
  );

  const availableSignals = [
    input.price > 0,
    ageDays != null,
    soldQuantity > 0,
    visits != null,
    input.similarity >= 0.4,
  ].filter(Boolean).length;

  const evidence = clamp(
    (availableSignals / 5) * 80 +
      Math.min(20, Math.max(0, 8 - input.searchPosition) * 2.5),
  );

  const hasSalesSignal = salesPerMonth != null || soldQuantity > 0;
  const rhythm: SearchOpportunityScore["rhythm"] =
    measured != null ? "MEDIDO" : salesPerDay != null ? "VIDA" : null;
  const total = hasSalesSignal
    ? Math.round(
        demand * 0.34 +
          velocity * 0.24 +
          relevance * 0.16 +
          price * 0.11 +
          logistics * 0.05 +
          evidence * 0.1,
      )
    : // Sem nenhum sinal de vendas, a nota só enxerga relevância, preço,
      // logística e evidência. Renormaliza esses pesos e limita a 60 para
      // não competir com anúncios que têm ritmo medido.
      Math.min(
        60,
        Math.round(
          ((relevance * 0.16 + price * 0.11 + logistics * 0.05 + evidence * 0.1) /
            0.42) *
            0.65,
        ),
      );

  const evidenceLabel =
    evidence >= 78 ? "HIGH" : evidence >= 56 ? "MEDIUM" : "LOW";

  // Demanda vem do ritmo de vendas, não da nota (a nota depende de preço e
  // logística e fazia tudo cair em "baixa").
  const demandLabel: SearchOpportunityScore["demandLabel"] =
    salesPerDay != null
      ? salesPerDay >= 10
        ? "EXCELENTE"
        : salesPerDay >= 3
          ? "ALTA"
          : salesPerDay >= 0.7
            ? "MEDIA"
            : "BAIXA"
      : soldQuantity > 0
        ? soldQuantity >= 5000
          ? "ALTA"
          : soldQuantity >= 500
            ? "MEDIA"
            : "BAIXA"
        : null;

  return {
    total,
    demandLabel,
    partial: !hasSalesSignal,
    evidence: evidenceLabel,
    salesPerDay: salesPerDay == null ? null : round1(salesPerDay),
    salesPerMonth: salesPerMonth == null ? null : round1(salesPerMonth),
    visitsPerDay: visitsPerDay == null ? null : round1(visitsPerDay),
    revenuePerDay: revenuePerDay == null ? null : round1(revenuePerDay),
    revenuePerMonth:
      revenuePerMonth == null ? null : round1(revenuePerMonth),
    ageDays,
    rhythm,
    components: {
      demand: Math.round(demand),
      velocity: Math.round(velocity),
      relevance: Math.round(relevance),
      price: Math.round(price),
      logistics: Math.round(logistics),
      evidence: Math.round(evidence),
    },
  };
}

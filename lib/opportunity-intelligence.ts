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
};

export type SearchOpportunityScore = {
  total: number;
  demandLabel: "BAIXA" | "MEDIA" | "ALTA" | "EXCELENTE";
  evidence: "LOW" | "MEDIUM" | "HIGH";
  salesPerDay: number | null;
  salesPerMonth: number | null;
  visitsPerDay: number | null;
  revenuePerDay: number | null;
  revenuePerMonth: number | null;
  ageDays: number | null;
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

  const salesPerDay =
    ageDays != null && soldQuantity > 0 ? soldQuantity / ageDays : null;
  const salesPerMonth =
    salesPerDay == null ? null : salesPerDay * 30;
  const visitsPerDay =
    ageDays != null && visits != null ? visits / ageDays : null;
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
    soldQuantity >= 0,
    visits != null,
    input.similarity >= 0.4,
  ].filter(Boolean).length;

  const evidence = clamp(
    (availableSignals / 5) * 80 +
      Math.min(20, Math.max(0, 8 - input.searchPosition) * 2.5),
  );

  const total = Math.round(
    demand * 0.34 +
      velocity * 0.24 +
      relevance * 0.16 +
      price * 0.11 +
      logistics * 0.05 +
      evidence * 0.1,
  );

  const evidenceLabel =
    evidence >= 78 ? "HIGH" : evidence >= 56 ? "MEDIUM" : "LOW";

  const demandLabel =
    total >= 80
      ? "EXCELENTE"
      : total >= 65
        ? "ALTA"
        : total >= 45
          ? "MEDIA"
          : "BAIXA";

  return {
    total,
    demandLabel,
    evidence: evidenceLabel,
    salesPerDay: salesPerDay == null ? null : round1(salesPerDay),
    salesPerMonth: salesPerMonth == null ? null : round1(salesPerMonth),
    visitsPerDay: visitsPerDay == null ? null : round1(visitsPerDay),
    revenuePerDay: revenuePerDay == null ? null : round1(revenuePerDay),
    revenuePerMonth:
      revenuePerMonth == null ? null : round1(revenuePerMonth),
    ageDays,
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

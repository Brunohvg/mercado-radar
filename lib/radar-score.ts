export type RadarOpportunityInput = {
  price: number;
  soldQuantity?: number | null;
  visits?: number | null;
  dateCreated?: string | null;
  freeShipping?: boolean;
  listingTypeId?: string | null;
};

export type RadarOpportunityScore = {
  score: number;
  demandLabel: "BAIXA" | "MEDIA" | "ALTA" | "EXCELENTE";
  salesPerDay: number | null;
  salesPerMonth: number | null;
  revenuePerMonth: number | null;
  ageDays: number | null;
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

const round1 = (value: number) =>
  Math.round((value + Number.EPSILON) * 10) / 10;

function safeAgeDays(dateCreated?: string | null) {
  if (!dateCreated) return null;
  const time = new Date(dateCreated).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(1, Math.floor((Date.now() - time) / 86_400_000));
}

export function calculateRadarOpportunityScore(
  input: RadarOpportunityInput,
): RadarOpportunityScore {
  const ageDays = safeAgeDays(input.dateCreated);
  const soldQuantity = Math.max(0, Number(input.soldQuantity ?? 0));
  const visits = Math.max(0, Number(input.visits ?? 0));

  const salesPerDay =
    ageDays && soldQuantity > 0 ? soldQuantity / ageDays : null;

  const salesPerMonth =
    salesPerDay == null ? null : salesPerDay * 30;

  const revenuePerMonth =
    salesPerMonth == null ? null : salesPerMonth * Math.max(0, input.price);

  const salesVelocityScore =
    salesPerMonth == null
      ? 0
      : clamp((Math.log10(salesPerMonth + 1) / 2.2) * 100);

  const soldProofScore = clamp((Math.log10(soldQuantity + 1) / 4) * 100);
  const visitSignalScore =
    visits > 0 ? clamp((Math.log10(visits + 1) / 5) * 100) : 45;
  const shippingScore = input.freeShipping ? 75 : 50;
  const listingScore =
    input.listingTypeId === "gold_pro"
      ? 70
      : input.listingTypeId === "gold_special"
        ? 65
        : 55;

  const score = Math.round(
    salesVelocityScore * 0.45 +
      soldProofScore * 0.25 +
      visitSignalScore * 0.15 +
      shippingScore * 0.1 +
      listingScore * 0.05,
  );

  const demandLabel =
    score >= 80
      ? "EXCELENTE"
      : score >= 65
        ? "ALTA"
        : score >= 45
          ? "MEDIA"
          : "BAIXA";

  return {
    score,
    demandLabel,
    salesPerDay: salesPerDay == null ? null : round1(salesPerDay),
    salesPerMonth: salesPerMonth == null ? null : round1(salesPerMonth),
    revenuePerMonth: revenuePerMonth == null ? null : round1(revenuePerMonth),
    ageDays,
  };
}

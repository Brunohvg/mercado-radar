/** Public listing counters are not order data. Do not infer missing values. */
export function reportedSold(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : null;
}
export function apiSold(raw: unknown): number | null {
  const entry = raw as { body?: { sold_quantity?: unknown } } | null;
  return reportedSold(entry?.body?.sold_quantity);
}
export type SalesReading = { capturedAt: Date | string; soldQuantity: number; soldKnown: boolean; soldIsLowerBound: boolean; trackingMode: string };
export const VALIDATED_COUNTER = "API_VALIDATED";
export type SalesVelocity = {
  lifetime: number | null;
  lifetimeIsMinimum: boolean;
  ageDays: number | null;
  recent: number | null;
  recentDays: number | null;
};
const DAY = 86400000;
const round = (n: number) => Math.round(n * 10) / 10;
export function salesVelocity(input: {
  sold: number | null; lowerBound: boolean; dateCreated?: string | null;
  observedAt: string; readings?: SalesReading[];
}): SalesVelocity {
  const at = Date.parse(input.observedAt);
  const created = Date.parse(input.dateCreated ?? "");
  const days = (at - created) / DAY;
  const ageDays = Number.isFinite(days) && days > 0 ? days : null;
  const sold = reportedSold(input.sold);
  // Avoid extrapolating a few hours into a month.
  const lifetime = sold !== null && ageDays !== null && ageDays >= 1
    ? round(sold * 30 / ageDays) : null;
  const rows = (input.readings ?? []).filter(r =>
    r.trackingMode === VALIDATED_COUNTER && r.soldKnown && !r.soldIsLowerBound &&
    reportedSold(r.soldQuantity) !== null &&
    Number.isFinite(new Date(r.capturedAt).getTime()) &&
    new Date(r.capturedAt).getTime() <= at &&
    at - new Date(r.capturedAt).getTime() <= 30 * DAY
  ).sort((a,b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  const last = rows.at(-1), first = rows[0];
  const span = first && last ? (new Date(last.capturedAt).getTime() - new Date(first.capturedAt).getTime()) / DAY : 0;
  const monotonic = rows.every((r,i) => i === 0 || r.soldQuantity >= rows[i-1].soldQuantity);
  const recent = last && first && span >= 2 && monotonic && at - new Date(last.capturedAt).getTime() <= 3 * DAY
    ? round((last.soldQuantity - first.soldQuantity) * 30 / span) : null;
  return { lifetime, lifetimeIsMinimum: lifetime !== null && input.lowerBound, ageDays: ageDays === null ? null : round(ageDays), recent, recentDays: recent === null ? null : round(span) };
}

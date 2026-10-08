export type RadarMomentumSnapshot = {
  score: number | null;
  demandLabel: string | null;
  soldQuantity: number;
  visits: number | null;
  capturedAt: Date | string;
};

export type RadarMomentumResult = {
  status: "LEARNING" | "READY";
  score: number | null;
  confidence: number;
  spanHours: number;
  soldDelta: number;
  visitsDelta: number | null;
  salesPerDay: number | null;
  visitsPerDay: number | null;
  conversionProxyPercent: number | null;
  scoreDelta: number | null;
  demandDelta: number | null;
  direction: "UP" | "STABLE" | "DOWN" | "LEARNING";
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

const round1 = (value: number) =>
  Math.round((value + Number.EPSILON) * 10) / 10;

const DEMAND_ORDER = ["BAIXA", "MEDIA", "ALTA", "EXCELENTE"];

function demandIndex(value: string | null) {
  return value ? DEMAND_ORDER.indexOf(value) : -1;
}

function timeValue(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

export function calculateRadarMomentum(
  input: RadarMomentumSnapshot[],
): RadarMomentumResult | null {
  if (input.length < 2) return null;

  const snapshots = [...input]
    .filter((snapshot) => Number.isFinite(timeValue(snapshot.capturedAt)))
    .sort((a, b) => timeValue(a.capturedAt) - timeValue(b.capturedAt));

  if (snapshots.length < 2) return null;

  const latest = snapshots[snapshots.length - 1];
  const latestTime = timeValue(latest.capturedAt);
  const sevenDaysAgo = latestTime - 7 * 24 * 60 * 60 * 1000;

  const withinWindow = snapshots.filter(
    (snapshot) => timeValue(snapshot.capturedAt) >= sevenDaysAgo,
  );

  const oldest = withinWindow[0] ?? snapshots[0];
  const oldestTime = timeValue(oldest.capturedAt);
  const spanHours = Math.max(
    (latestTime - oldestTime) / (60 * 60 * 1000),
    0,
  );

  const soldDelta = Math.max(0, latest.soldQuantity - oldest.soldQuantity);
  const visitsDelta =
    latest.visits == null || oldest.visits == null
      ? null
      : Math.max(0, latest.visits - oldest.visits);

  const days = spanHours / 24;
  const salesPerDay = days > 0 ? soldDelta / days : null;
  const visitsPerDay =
    days > 0 && visitsDelta != null ? visitsDelta / days : null;
  const conversionProxyPercent =
    visitsDelta != null && visitsDelta > 0
      ? (soldDelta / visitsDelta) * 100
      : null;

  const scoreDelta =
    latest.score == null || oldest.score == null
      ? null
      : latest.score - oldest.score;

  const currentDemand = demandIndex(latest.demandLabel);
  const previousDemand = demandIndex(oldest.demandLabel);
  const demandDelta =
    currentDemand >= 0 && previousDemand >= 0
      ? currentDemand - previousDemand
      : null;

  const sampleConfidence = clamp(25 + withinWindow.length * 9);
  const timeConfidence =
    spanHours >= 168
      ? 100
      : spanHours >= 72
        ? 82
        : spanHours >= 24
          ? 62
          : spanHours >= 6
            ? 42
            : Math.round((spanHours / 6) * 35);

  const confidence = Math.round(
    Math.min(sampleConfidence, timeConfidence),
  );

  if (spanHours < 6) {
    return {
      status: "LEARNING",
      score: null,
      confidence,
      spanHours: round1(spanHours),
      soldDelta,
      visitsDelta,
      salesPerDay: salesPerDay == null ? null : round1(salesPerDay),
      visitsPerDay: visitsPerDay == null ? null : round1(visitsPerDay),
      conversionProxyPercent:
        conversionProxyPercent == null
          ? null
          : round1(conversionProxyPercent),
      scoreDelta,
      demandDelta,
      direction: "LEARNING",
    };
  }

  const monthlySalesPace =
    salesPerDay == null ? 0 : Math.max(0, salesPerDay * 30);
  const monthlyVisitPace =
    visitsPerDay == null ? 0 : Math.max(0, visitsPerDay * 30);

  const salesPaceScore = clamp(
    (Math.log10(monthlySalesPace + 1) / 2.2) * 100,
  );
  const visitsPaceScore =
    visitsPerDay == null
      ? 45
      : clamp((Math.log10(monthlyVisitPace + 1) / 4.2) * 100);
  const scoreTrend = clamp(50 + Number(scoreDelta ?? 0) * 3);
  const demandTrend = clamp(50 + Number(demandDelta ?? 0) * 18);

  const rawScore =
    salesPaceScore * 0.45 +
    visitsPaceScore * 0.25 +
    scoreTrend * 0.2 +
    demandTrend * 0.1;

  const score = Math.round(rawScore);
  const direction =
    scoreDelta != null && scoreDelta <= -8
      ? "DOWN"
      : demandDelta != null && demandDelta < 0
        ? "DOWN"
        : soldDelta > 0 || (scoreDelta != null && scoreDelta >= 5)
          ? "UP"
          : "STABLE";

  return {
    status: "READY",
    score,
    confidence,
    spanHours: round1(spanHours),
    soldDelta,
    visitsDelta,
    salesPerDay: salesPerDay == null ? null : round1(salesPerDay),
    visitsPerDay: visitsPerDay == null ? null : round1(visitsPerDay),
    conversionProxyPercent:
      conversionProxyPercent == null
        ? null
        : round1(conversionProxyPercent),
    scoreDelta,
    demandDelta,
    direction,
  };
}

// Resumo de preços de concorrentes para uma decisão rápida. Puro.

const round2 = (v: number) => Math.round(v * 100) / 100;

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return round2(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

export function summarizePrices(prices: number[], myPrice: number | null) {
  const sorted = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const cheaper = myPrice == null ? null : sorted.filter((p) => p < myPrice - 0.005).length;
  return {
    count: sorted.length,
    minimum: sorted.length ? round2(sorted[0]) : null,
    p25: quantile(sorted, 0.25),
    median,
    p75: quantile(sorted, 0.75),
    maximum: sorted.length ? round2(sorted[sorted.length - 1]) : null,
    average: sorted.length ? round2(sorted.reduce((s, p) => s + p, 0) / sorted.length) : null,
    gapToMedian: median && myPrice != null ? Math.round(((myPrice - median) / median) * 1000) / 10 : null,
    /** Quantas ofertas estão mais baratas que a sua (0 = você é o mais barato). */
    cheaperThanYou: cheaper,
  };
}

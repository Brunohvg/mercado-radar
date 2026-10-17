/** Similar title is a candidate, never proof of equal quantity/specification. */
const STOP = new Set(
  "de da do das dos com para por em um uma novo nova original cor full frete gratis envio sem".split(
    " ",
  ),
);
export function comparisonTokens(text: string) {
  return [
    ...new Set(
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/(\d)\s*(metros?|mts?)\b/g, "$1m")
        .replace(/(\d)\s*milimetros?\b/g, "$1mm")
        .replace(/(\d)\s+(mm|cm|m|ml|kg|g)\b/g, "$1$2")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter((t) => t && !STOP.has(t)),
    ),
  ];
}
export function comparableTitle(query: string, title: string) {
  const a = comparisonTokens(query),
    b = comparisonTokens(title),
    set = new Set(b);
  if (!a.length) return { accepted: false, similarity: 0 };
  const quantitiesA = a.filter((t) => /\d/.test(t)).sort(),
    quantitiesB = b.filter((t) => /\d/.test(t)).sort();
  const quantitiesMatch =
    JSON.stringify(quantitiesA) === JSON.stringify(quantitiesB);
  const kitMatches = a.includes("kit") === b.includes("kit");
  const similarity = a.filter((t) => set.has(t)).length / a.length;
  return {
    accepted: quantitiesMatch && kitMatches && similarity >= 0.55,
    similarity,
  };
}
export function priceSample(prices: number[], currentPrice?: number | null) {
  const sorted = prices
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (sorted.length < 3) return null;
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const q = (p: number) => {
    const i = (sorted.length - 1) * p,
      lo = Math.floor(i);
    return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
  };
  const median = q(0.5);
  return {
    count: sorted.length,
    minimum: sorted[0],
    p25: round(q(0.25)),
    median: round(median),
    p75: round(q(0.75)),
    maximum: sorted.at(-1),
    average: round(sorted.reduce((sum, n) => sum + n, 0) / sorted.length),
    gapToMedian:
      currentPrice && median
        ? round(((currentPrice - median) / median) * 100)
        : null,
  };
}

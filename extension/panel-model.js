(() => {
  "use strict";
  function money(value) {
    const text = String(value ?? "")
      .trim()
      .replace(/^R\$\s*/, "")
      .replace(/\s/g, "");
    if (!text) return null;
    const normalized = text.includes(",")
      ? text.replace(/\./g, "").replace(",", ".")
      : /^\d{1,3}(?:\.\d{3})+$/.test(text)
        ? text.replace(/\./g, "")
        : text;
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  function sample(prices, currentPrice) {
    const sorted = prices
      .filter((p) => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b);
    if (sorted.length < 3) return null;
    const quantile = (p) => {
      const i = (sorted.length - 1) * p;
      return (
        sorted[Math.floor(i)] +
        (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i - Math.floor(i))
      );
    };
    const median = quantile(0.5);
    return {
      count: sorted.length,
      p25: quantile(0.25),
      median,
      p75: quantile(0.75),
      gap: currentPrice > 0 ? (currentPrice / median - 1) * 100 : null,
    };
  }
  globalThis.RadarPanelModel = { money, sample };
})();

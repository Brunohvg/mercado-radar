/** Scenario entered by the user. It is never reported as Mercado Livre Ads data. */
export function simulateAdvertising(input: {
  salePrice: number;
  profitBeforeAds: number;
  roasTarget: number;
  attributedSalesPercent: number;
}) {
  const { salePrice, profitBeforeAds, roasTarget, attributedSalesPercent } =
    input;
  if (
    ![salePrice, profitBeforeAds, roasTarget, attributedSalesPercent].every(
      Number.isFinite,
    ) ||
    salePrice <= 0 ||
    roasTarget <= 0 ||
    attributedSalesPercent < 0 ||
    attributedSalesPercent > 100
  )
    throw new Error("Parâmetros de publicidade inválidos.");
  const round = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100;
  const costPerSale = round(
    (salePrice * attributedSalesPercent) / 100 / roasTarget,
  );
  const profitAfterAds = round(profitBeforeAds - costPerSale);
  return {
    source: "USER_SCENARIO" as const,
    roasTarget,
    attributedSalesPercent,
    costPerSale,
    profitAfterAds,
    marginAfterAdsPercent: (profitAfterAds / salePrice) * 100,
    tacosPercent: (costPerSale / salePrice) * 100,
    breakEvenRoas: profitBeforeAds > 0 ? salePrice / profitBeforeAds : null,
  };
}

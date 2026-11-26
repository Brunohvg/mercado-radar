import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { simulateAdvertising } = await loadTs("../lib/ads-simulation.ts");
test("Ads aplica participação de vendas ao gasto médio e mantém equilíbrio separado de TACOS", () => {
  const result = simulateAdvertising({
    salePrice: 19.68,
    profitBeforeAds: 8.94,
    roasTarget: 5,
    attributedSalesPercent: 20,
  });
  assert.equal(result.costPerSale, 0.79);
  assert.equal(result.profitAfterAds, 8.15);
  assert.ok(Math.abs(result.marginAfterAdsPercent - 41.4126) < 0.001);
  assert.ok(Math.abs(result.breakEvenRoas - 2.2013) < 0.001);
  assert.equal(result.source, "USER_SCENARIO");
  assert.equal(
    simulateAdvertising({
      salePrice: 100,
      profitBeforeAds: 10,
      roasTarget: 5,
      attributedSalesPercent: 100,
    }).profitAfterAds,
    -10,
  );
});
test("Ads não transforma ROAS ausente, zero ou lucro negativo em recomendação viável", () => {
  for (const roasTarget of [0, -1, NaN, Infinity])
    assert.throws(() =>
      simulateAdvertising({
        salePrice: 100,
        profitBeforeAds: 20,
        roasTarget,
        attributedSalesPercent: 20,
      }),
    );
  const result = simulateAdvertising({
    salePrice: 100,
    profitBeforeAds: -5,
    roasTarget: 10,
    attributedSalesPercent: 0,
  });
  assert.equal(result.breakEvenRoas, null);
  assert.equal(result.costPerSale, 0);
  assert.equal(result.profitAfterAds, -5);
});

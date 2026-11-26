import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { evaluateAdsMargin, adsMarginRank } = await loadTs("../lib/ads-margin.ts");
const base = { cost: 50, adsRevenue: 1000, adsUnits: 10, profitBeforeAds: 200, readyUnits: 20, totalUnits: 20, totalRevenue: 2000 };

test("ACOS dentro do limite (margem antes dos anúncios) se paga", () => {
  const r = evaluateAdsMargin({ ...base, cost: 80 });
  assert.equal(r.breakEvenAcos, 10);
  assert.equal(r.acos, 8);
  assert.equal(r.profitAfterAds, 120);
  assert.equal(r.verdict, "PAGA");
  assert.equal(evaluateAdsMargin(base).verdict, "PODE_INVESTIR");
});

test("venda pelo anúncio no prejuízo e gasto maior que o lucro", () => {
  const r = evaluateAdsMargin({ ...base, cost: 150 });
  assert.equal(r.verdict, "VENDA_ADS_NO_PREJUIZO");
  assert.equal(r.adsCostPerSale, 15);
  assert.equal(r.profitPerUnit, 10);
  const eat = evaluateAdsMargin({ ...base, cost: 260 });
  assert.equal(eat.verdict, "COME_LUCRO");
  assert.equal(eat.profitAfterAds, -60);
  assert.ok(adsMarginRank("COME_LUCRO") < adsMarginRank("PAGA"));
});

test("sem venda pelo anúncio e sem custo conhecido não inventam número", () => {
  assert.equal(evaluateAdsMargin({ ...base, adsRevenue: 0, adsUnits: 0 }).verdict, "SEM_VENDA");
  const none = evaluateAdsMargin({ ...base, profitBeforeAds: null, readyUnits: 0 });
  assert.equal(none.verdict, "SEM_CUSTO");
  assert.equal(none.profitAfterAds, null);
  assert.equal(evaluateAdsMargin({ ...base, readyUnits: 10 }).verdict, "SEM_CUSTO");
});

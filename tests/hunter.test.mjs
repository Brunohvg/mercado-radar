import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { evaluateProduct, rankCandidates } = await loadTs("../lib/hunter/rank.ts");
const settings = { taxPercent: 4, operatingCost: 1, targetMarginPercent: 20, ownShippingPerUnit: 20, testLotUnits: 10 };
const offers = (prices, full = 0) => prices.map((price, i) => ({ price, sellerId: "s" + i, logisticType: i < full ? "fulfillment" : "drop_off" }));
const base = (over) => ({ productId: "MLB1", name: "Ilhós 54", picture: null, permalink: null, categoryId: "MLB1234", categoryName: "Ilhoses", bestSellerPosition: 2, trendKeyword: null, offers: offers([40, 42, 45]), offersTotal: 3, saleFee: 5, alreadySelling: false, ...over });

test("abaixo de R$ 79 o comprador paga o frete e o teto sai da conta completa", () => {
  const c = evaluateProduct(base({}), settings);
  assert.equal(c.price, 42);
  assert.equal(c.shipping, 0);
  // 42 × (1 − 0,04 − 0,20) − 5 − 0 − 1 = 25,92
  assert.equal(c.maxCost, 25.92);
  assert.deepEqual(c.testLot, { units: 10, capital: 259.2 });
  assert.match(c.formula, /comprador paga/);
  assert.ok(c.reasons.some((r) => /2º mais vendido/.test(r)));
});

test("acima de R$ 79 usa o frete médio dos seus pedidos; sem ele, não inventa teto", () => {
  const withShip = evaluateProduct(base({ offers: offers([100, 110]) }), settings);
  assert.equal(withShip.shippingSource, "SEUS_PEDIDOS");
  assert.equal(withShip.maxCost, 105 * 0.76 - 5 - 20 - 1);
  const without = evaluateProduct(base({ offers: offers([100, 110]) }), { ...settings, ownShippingPerUnit: null });
  assert.equal(without.maxCost, null);
  assert.equal(without.testLot, null);
  const noFee = evaluateProduct(base({ saleFee: null }), settings);
  assert.equal(noFee.maxCost, null);
  assert.ok(noFee.warnings.some((w) => /tarifa/.test(w)));
});

test("ranking: viáveis primeiro, Full e concorrência pesam, o que você já vende vai para o fim", () => {
  const good = evaluateProduct(base({ productId: "A" }), settings);
  const crowded = evaluateProduct(base({ productId: "B", offers: offers(Array(25).fill(42), 20) }), settings);
  const mine = evaluateProduct(base({ productId: "C", alreadySelling: true }), settings);
  const loss = evaluateProduct(base({ productId: "D", saleFee: 40 }), settings);
  assert.deepEqual(rankCandidates([mine, loss, crowded, good]).map((c) => c.productId), ["A", "B", "C", "D"]);
  assert.ok(crowded.warnings.some((w) => /Full/.test(w)));
  assert.equal(loss.viable, false);
});

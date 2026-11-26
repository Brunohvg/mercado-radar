import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { planListingEdit } = await loadTs("../lib/listing-edit.ts");
const { summarizePrices } = await loadTs("../lib/market-stats.ts");
const live = { price: 100, availableQuantity: 20, status: "active", variationIds: [] };

test("monta o corpo só com o que mudou e barra erro de digitação", () => {
  const ok = planListingEdit({ live, change: { price: 95, availableQuantity: 20 }, floor: 80, allowBelowFloor: false });
  assert.deepEqual(ok.body, { price: 95 });
  assert.equal(planListingEdit({ live, change: { price: 1000 }, floor: null, allowBelowFloor: false }).status, 422);
  assert.equal(planListingEdit({ live, change: { price: 100 }, floor: null, allowBelowFloor: false }).status, 400);
});

test("abaixo do piso só passa com confirmação extra", () => {
  const blocked = planListingEdit({ live, change: { price: 70 }, floor: 80, allowBelowFloor: false });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.floor, 80);
  assert.deepEqual(planListingEdit({ live, change: { price: 70 }, floor: 80, allowBelowFloor: true }).body, { price: 70 });
});

test("variações: preço vai por variação e estoque é recusado; reativar exige estoque", () => {
  const v = { ...live, variationIds: [1, 2] };
  assert.deepEqual(planListingEdit({ live: v, change: { price: 90 }, floor: null, allowBelowFloor: false }).body, { variations: [{ id: 1, price: 90 }, { id: 2, price: 90 }] });
  assert.equal(planListingEdit({ live: v, change: { availableQuantity: 3 }, floor: null, allowBelowFloor: false }).status, 422);
  const paused = { ...live, status: "paused", availableQuantity: 0 };
  assert.equal(planListingEdit({ live: paused, change: { status: "active" }, floor: null, allowBelowFloor: false }).status, 422);
  assert.deepEqual(planListingEdit({ live: paused, change: { status: "active", availableQuantity: 4 }, floor: null, allowBelowFloor: false }).body, { available_quantity: 4, status: "active" });
  assert.equal(planListingEdit({ live: { ...live, status: "closed" }, change: { price: 90 }, floor: null, allowBelowFloor: false }).status, 409);
});

test("resumo de preços diz quantas ofertas estão mais baratas", () => {
  const s = summarizePrices([10, 20, 30, 40, 50], 35);
  assert.equal(s.median, 30);
  assert.equal(s.p25, 20);
  assert.equal(s.cheaperThanYou, 3);
  assert.equal(s.gapToMedian, 16.7);
  assert.equal(summarizePrices([], 10).median, null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { parseShippingDimensions, parseShippingDiscount } = await loadTs(
  "../lib/shipping-package.ts",
);
test("desconto de frete preserva a taxa informada e rejeita valores inválidos", () => {
  assert.deepEqual(
    parseShippingDiscount({ rate: 0.5, promoted_amount: 13.7 }),
    { rate: 0.5, baseAmount: 13.7 },
  );
  assert.deepEqual(
    parseShippingDiscount({ rate: "0", promoted_amount: null }),
    { rate: 0, baseAmount: null },
  );
  for (const value of [
    null,
    {},
    [],
    { rate: true },
    { rate: "" },
    { rate: -0.1 },
    { rate: 50 },
    { rate: Infinity },
  ])
    assert.equal(parseShippingDiscount(value), null);
});
test("embalagem automática usa somente dimensões de envio com unidades conhecidas", () => {
  assert.deepEqual(parseShippingDimensions("10x15x20,500"), {
    heightCm: 10,
    widthCm: 15,
    lengthCm: 20,
    weightGrams: 500,
  });
  assert.deepEqual(parseShippingDimensions("10.5x15x20,500"), {
    heightCm: 10.5,
    widthCm: 15,
    lengthCm: 20,
    weightGrams: 500,
  });
});
test("embalagem inválida, peso fracionado ou dimensões sem unidade não geram cotação automática", () => {
  for (const value of [
    null,
    {},
    "10x15x20,0.5",
    "10x15x20,0",
    "301x15x20,500",
    "10x15x20,100001",
    "10x15x20",
    "peso 0.5 kg",
  ])
    assert.equal(parseShippingDimensions(value), null);
});

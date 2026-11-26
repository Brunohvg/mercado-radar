import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { fillMissingCosts, maxSupplierCost, ML_FREE_SHIPPING_THRESHOLD } = await loadTs("../lib/calculator-defaults.ts");
const { analyzeProfitability } = await loadTs("../lib/profitability.ts");

test("sem imposto: usa o padrão da conta, senão calcula sem imposto e avisa", () => {
  const base = { price: 50, shippingCost: 0, logisticType: "drop_off", freeShipping: false };
  const withDefault = fillMissingCosts({ ...base, taxPercent: null, workspaceTaxPercent: 6 });
  assert.equal(withDefault.taxPercent, 6);
  assert.equal(withDefault.assumptions[0].material, false);
  const none = fillMissingCosts({ ...base, taxPercent: null, workspaceTaxPercent: null });
  assert.equal(none.taxPercent, 0);
  assert.equal(none.assumptions[0].material, true);
  assert.match(none.assumptions[0].text, /sem imposto/);
  assert.deepEqual(fillMissingCosts({ ...base, taxPercent: 4, workspaceTaxPercent: 6 }).assumptions, []);
});

test("sem frete: abaixo de R$ 79 o comprador paga; acima, avisa que o frete não entrou", () => {
  const common = { taxPercent: 0, workspaceTaxPercent: null, logisticType: "drop_off", freeShipping: false };
  const cheap = fillMissingCosts({ ...common, price: ML_FREE_SHIPPING_THRESHOLD - 0.1, shippingCost: null });
  assert.equal(cheap.shippingCost, 0);
  assert.equal(cheap.shippingPending, false);
  assert.equal(cheap.assumptions[0].material, false);
  const expensive = fillMissingCosts({ ...common, price: 120, shippingCost: null });
  assert.equal(expensive.shippingPending, true);
  assert.match(expensive.assumptions[0].text, /Frete NÃO incluído/);
  const full = fillMissingCosts({ ...common, price: 40, shippingCost: null, logisticType: "fulfillment" });
  assert.equal(full.shippingPending, true, "Full below the threshold still needs a freight check");
  assert.deepEqual(fillMissingCosts({ ...common, price: 120, shippingCost: 22 }).assumptions, []);
});

test("modo reverso: custo máximo dá exatamente a margem alvo; empate dá lucro zero", () => {
  const input = {
    productName: "x", discountPercent: 0, kitQuantity: 2, salePrice: 100, listingType: "CLASSIC",
    commissionPercent: 12, fixedFee: 0, shippingCost: 20, operatingCost: 1, taxPercent: 4,
    targetMarginPercent: 20, targetRoiPercent: 30,
  };
  const r = maxSupplierCost(input);
  // 100 - 12 - 20 - 1 - 4 = 63 disponível; 63 - 20 (margem) = 43 para 2 unidades.
  assert.equal(r.breakEven, 31.5);
  assert.equal(r.forTargetMargin, 21.5);
  const check = analyzeProfitability({ ...input, supplierPrice: r.forTargetMargin });
  assert.ok(Math.abs(check.marginPercent - 20) < 0.05);
  assert.equal(maxSupplierCost({ ...input, salePrice: 10 }).forTargetMargin, 0, "never negative");
});

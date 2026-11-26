import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { fillMissingCosts, maxSupplierCost } = await loadTs("../lib/calculator-defaults.ts");
const { analyzeProfitability } = await loadTs("../lib/profitability.ts");

test("imposto desconhecido permanece pendente; configuração e zero explícito são conhecidos", () => {
  const base = { shippingCost: 0 };
  const withDefault = fillMissingCosts({ ...base, taxPercent: null, workspaceTaxPercent: 6 });
  assert.equal(withDefault.taxPercent, 6);
  assert.equal(withDefault.assumptions[0].material, false);
  const none = fillMissingCosts({ ...base, taxPercent: null, workspaceTaxPercent: null });
  assert.equal(none.taxPercent, null);
  assert.equal(none.assumptions[0].material, true);
  assert.match(none.assumptions[0].text, /não será tratado como zero/);
  assert.equal(fillMissingCosts({ ...base, taxPercent: 0, workspaceTaxPercent: null }).taxPercent, 0);
  assert.deepEqual(fillMissingCosts({ ...base, taxPercent: 4, workspaceTaxPercent: 6 }).assumptions, []);
});

test("preço do anúncio não infere frete do vendedor; frete ausente permanece pendente", () => {
  const common = { taxPercent: 0, workspaceTaxPercent: null };
  const cheap = fillMissingCosts({ ...common, shippingCost: null });
  assert.equal(cheap.shippingCost, null);
  assert.equal(cheap.shippingPending, true);
  assert.equal(cheap.assumptions[0].material, true);
  assert.match(cheap.assumptions[0].text, /não confirmam frete zero/);
  const expensive = fillMissingCosts({ ...common, shippingCost: null });
  assert.equal(expensive.shippingPending, true);
  assert.match(expensive.assumptions[0].text, /custo ou obtenha uma cotação/);
  const known = fillMissingCosts({ ...common, shippingCost: 22 });
  assert.equal(known.shippingPending, false);
  assert.deepEqual(known.assumptions, []);
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
  assert.equal(r.maximumSupplierCost, 21.5);
  assert.equal(r.limitingTarget, "margin");
  const check = analyzeProfitability({ ...input, supplierPrice: r.forTargetMargin });
  assert.ok(Math.abs(check.marginPercent - 20) < 0.05);
  assert.equal(maxSupplierCost({ ...input, salePrice: 10 }).forTargetMargin, 0, "never negative");
});

test("modo reverso respeita ROI e margem juntos e informa a meta limitante", () => {
  const input = {
    productName: "x", discountPercent: 0, kitQuantity: 1, salePrice: 100, listingType: "CLASSIC",
    commissionPercent: 12, fixedFee: 0, shippingCost: 10, operatingCost: 2, taxPercent: 4,
    targetMarginPercent: 20, targetRoiPercent: 100,
  };
  const r = maxSupplierCost(input);
  assert.equal(r.forTargetMargin, 52);
  assert.equal(r.forTargetRoi, 35);
  assert.equal(r.maximumSupplierCost, 35);
  assert.equal(r.limitingTarget, "ROI");
  const check = analyzeProfitability({ ...input, supplierPrice: r.maximumSupplierCost });
  assert.equal(check.marginPercent, 37);
  assert.equal(check.roiPercent, 100);
  assert.ok(check.marginPercent >= input.targetMarginPercent);
  assert.ok(check.roiPercent >= input.targetRoiPercent);
});

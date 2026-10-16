import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { analyzeProfitability: analyze } = await loadTs(
  "../lib/profitability.ts",
);
const {
  calculateOrderEconomics: order,
  hasRefund,
  allocateCents,
} = await loadTs("../lib/sales-economics.ts");
const { buildProductDecision: decide } = await loadTs(
  "../lib/decision-engine.ts",
);
const { recommendAdsAction } = await loadTs("../lib/ads-strategy.ts");
const { buildCsv } = await loadTs("../lib/csv.ts");
const base = {
  productName: "Kit ilhós",
  supplierPrice: 27.9,
  discountPercent: 10,
  kitQuantity: 1,
  salePrice: 59.9,
  listingType: "CLASSIC",
  commissionPercent: 12,
  fixedFee: 6.5,
  shippingCost: 6.85,
  operatingCost: 1,
  taxPercent: 4,
  targetMarginPercent: 20,
  targetRoiPercent: 30,
};
test("golden: kit inclui produto, desconto, comissão, tarifa, frete, operação e imposto", () => {
  const r = analyze(base);
  assert.equal(r.purchaseCost, 25.11);
  assert.equal(r.commissionAmount, 7.19);
  assert.equal(r.taxAmount, 2.4);
  assert.equal(r.profit, 10.85);
  assert.equal(r.marginPercent, 18.11);
  assert.equal(r.verdict, "TIGHT");
});
test("classificação não reprova 10–19,99% como inviável", () => {
  assert.equal(
    analyze({
      ...base,
      supplierPrice: 85,
      discountPercent: 0,
      salePrice: 100,
      commissionPercent: 0,
      fixedFee: 0,
      shippingCost: 0,
      operatingCost: 0,
      taxPercent: 0,
    }).verdict,
    "TIGHT",
  );
  assert.equal(
    analyze({
      ...base,
      supplierPrice: 91,
      discountPercent: 0,
      salePrice: 100,
      commissionPercent: 0,
      fixedFee: 0,
      shippingCost: 0,
      operatingCost: 0,
      taxPercent: 0,
    }).verdict,
    "BAD",
  );
});
test("meta impossível é null, nunca Infinity serializado ou zero", () =>
  assert.equal(
    analyze({ ...base, targetMarginPercent: 90 }).minimumSuggestedPrice,
    null,
  ));
test("piso em centavos cumpre margem e ROI em uma amostra determinística", () => {
  for (let i = 1; i <= 300; i++) {
    const input = {
      ...base,
      supplierPrice: 5 + i / 9,
      taxPercent: i % 9,
      commissionPercent: 8 + (i % 14),
      kitQuantity: (i % 5) + 1,
    };
    const result = analyze(input);
    assert.ok(result.minimumSuggestedPrice != null);
    const floor = analyze({
      ...input,
      salePrice: result.minimumSuggestedPrice,
    });
    assert.ok(
      floor.profit + 1e-8 >=
        (floor.salePrice * input.targetMarginPercent) / 100,
    );
    assert.ok(
      floor.profit + 1e-8 >=
        ((floor.purchaseCost + input.operatingCost) * input.targetRoiPercent) /
          100,
    );
  }
});
test("kit multiplica o custo antes de apurar lucro", () => {
  const r = analyze({ ...base, kitQuantity: 3 });
  assert.equal(r.purchaseCost, 75.33);
  assert.ok(r.profit < 0);
});
test("NaN, infinito e custo negativo são rejeitados", () => {
  for (const patch of [
    { shippingCost: NaN },
    { supplierPrice: Infinity },
    { operatingCost: -1 },
    { kitQuantity: 1.5 },
    { commissionPercent: 99, taxPercent: 4 },
  ])
    assert.throws(() => analyze({ ...base, ...patch }));
});
const settled = {
  status: "paid",
  refunded: false,
  totalAmount: 100,
  fee: 12,
  shipping: 7,
  taxPercent: 4,
  operatingCost: 1,
  items: [
    { id: "a", quantity: 1, unitPrice: 60, unitCost: 25 },
    { id: "b", quantity: 1, unitPrice: 40, unitCost: 15 },
  ],
};
test("lucro realizado e rateio reconciliam exatamente", () => {
  const r = order(settled);
  assert.equal(r.profit, 36);
  assert.equal(
    r.itemProfits.reduce((s, i) => s + i.profit, 0),
    36,
  );
});
test("rateio reconcilia desconto do pedido e centavos", () => {
  const r = order({
    ...settled,
    totalAmount: 99.99,
    fee: 12.34,
    operatingCost: 1.01,
  });
  assert.equal(
    Math.round(r.itemProfits.reduce((s, i) => s + i.profit, 0) * 100),
    Math.round(r.profit * 100),
  );
});
for (const [name, patch, status] of [
  ["imposto não confirmado", { taxPercent: null }, "AWAITING_SETTINGS"],
  [
    "custo ausente",
    { items: [{ id: "a", quantity: 1, unitPrice: 100, unitCost: null }] },
    "AWAITING_PRODUCT_COST",
  ],
  ["frete ausente", { shipping: null }, "AWAITING_SHIPPING_COST"],
  ["tarifa ausente", { fee: null }, "AWAITING_FEE"],
  ["cancelamento", { status: "cancelled" }, "NOT_SETTLED"],
  ["pedido pendente", { status: "confirmed" }, "NOT_SETTLED"],
  ["reembolso parcial", { refunded: true }, "REFUND_REVIEW"],
  ["pedido sem itens", { items: [] }, "AWAITING_PRODUCT_COST"],
]) {
  test(name + " não vira lucro confirmado", () => {
    const r = order({ ...settled, ...patch });
    assert.equal(r.status, status);
    assert.equal(r.profit, null);
    assert.ok(r.itemProfits.every((i) => i.profit == null));
  });
}
test("zero é um custo conhecido e pode ser confirmado explicitamente", () =>
  assert.equal(
    order({ ...settled, fee: 0, shipping: 0, taxPercent: 0, operatingCost: 0 })
      .profit,
    60,
  ));
test("detecta reembolso e chargeback nos pagamentos", () => {
  assert.ok(
    hasRefund({
      payments: [{ status: "approved", transaction_amount_refunded: 1 }],
    }),
  );
  assert.ok(hasRefund({ payments: [{ status: "charged_back" }] }));
  assert.equal(hasRefund({ payments: [{ status: "approved" }] }), false);
});
test("rateio de 1 centavo é estável e não cria dinheiro", () =>
  assert.deepEqual(allocateCents(1, [1, 1, 1]), [1, 0, 0]));
const product = {
  cost: 20,
  price: 50,
  stock: 5,
  units: 30,
  revenue: 1500,
  knownRevenue: 1500,
  knownUnits: 30,
  profit: 450,
  historyComplete: true,
  windowDays: 30,
  targetMargin: 20,
  leadTimeDays: 7,
  safetyDays: 7,
  coverageDays: 21,
};
test("reposição usa prazo + segurança e mostra capital", () => {
  const r = decide(product);
  assert.equal(r.action, "RESTOCK");
  assert.equal(r.suggestedReorder, 16);
  assert.equal(r.capitalNeeded, 320);
});
test("histórico incompleto não recomenda compra", () => {
  const r = decide({ ...product, historyComplete: false });
  assert.notEqual(r.action, "RESTOCK");
  assert.equal(r.suggestedReorder, null);
});
test("margem desconhecida ou apertada não libera reposição", () => {
  for (const patch of [{ knownRevenue: 0 }, { profit: 225 }, { profit: 30 }])
    assert.notEqual(decide({ ...product, ...patch }).action, "RESTOCK");
});
test("estoque parado é identificado só com janela completa", () => {
  assert.equal(
    decide({ ...product, units: 0, revenue: 0, knownRevenue: 0, profit: 0 })
      .action,
    "IDLE",
  );
  assert.notEqual(
    decide({ ...product, units: 0, historyComplete: false }).action,
    "IDLE",
  );
});
test("Ads: lucro zero e cobertura parcial não autorizam escalar", () => {
  for (const patch of [
    { profitAfterAds: 0, profitCoveragePercent: 100 },
    { profitAfterAds: 10, profitCoveragePercent: 70 },
  ])
    assert.notEqual(
      recommendAdsAction({
        cost: 10,
        attributedRevenue: 100,
        roas: 10,
        roasTarget: 5,
        units: 20,
        ...patch,
      }).action,
      "SCALE",
    );
});
test("CSV bloqueia fórmulas de planilha e preserva aspas", () => {
  const csv = buildCsv([
    ['=HYPERLINK("malicioso")', "Produto;cor", "+55 31", "-10"],
  ]);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('"Produto;cor"'));
  assert.ok(csv.includes("'+55 31"));
});

test("alteração de custo ou preço bloqueia a compra pelo histórico antigo", () => {
  const r = decide({ ...product, currentEconomicsVerified: false });
  assert.equal(r.action, "VALIDATE_PROFIT");
  assert.equal(r.suggestedReorder, null);
  assert.equal(r.breakEvenRoas, null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const {
  defaultKitScenario,
  generateKitCompositions,
  evaluateKits,
  rankKitResults,
  kitQuoteContext,
} = await loadTs("../lib/kit-optimizer.ts");
function scenario() {
  return {
    ...defaultKitScenario(),
    productName: "Caneta Fantasminha Montovani",
    brand: "Montovani",
    model: "Fantasminha",
    categoryId: "MLB1234",
    unitCost: 4.5,
    variants: ["Azul", "Preta", "Vermelha", "Rosa"].map((label, index) => ({
      id: "v" + index,
      label,
      stock: 12,
      unitCost: null,
    })),
    packageCost: 1,
    operatingCost: 0.8,
    taxPercent: 4,
    commissionPercent: 12,
    fixedFee: 4,
    shippingCost: 6.85,
    pricePerUnit: 10,
    useApiQuotes: false,
  };
}
const find = (rows, quantity, parts = 1) =>
  rows.find((r) => r.quantity === quantity && r.parts.length === parts);
test("kits: gera composições Montovani de 2, 4, 6 e 8, sem duplicar nem exceder estoque", () => {
  const s = scenario(),
    rows = generateKitCompositions(s);
  for (const expected of [
    "2 Azul",
    "2 Azul + 2 Preta",
    "1 Azul + 1 Preta + 1 Vermelha + 1 Rosa",
    "2 Azul + 2 Preta + 2 Vermelha",
    "2 Azul + 2 Preta + 2 Vermelha + 2 Rosa",
  ])
    assert.ok(
      rows.some((r) => r.label === expected),
      expected,
    );
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  for (const r of rows) {
    assert.equal(
      r.parts.reduce((sum, p) => sum + p.quantity, 0),
      r.quantity,
    );
    for (const p of r.parts)
      assert.ok(
        p.quantity <= s.variants.find((v) => v.id === p.variantId).stock,
      );
  }
});
test("kits: reequilibra cores limitadas e nunca monta estoque insuficiente", () => {
  const s = scenario();
  s.variants.forEach((v, i) => (v.stock = [4, 2, 2, 0][i]));
  s.sizes = [8, 10];
  const rows = generateKitCompositions(s);
  assert.ok(rows.some((r) => r.label === "4 Azul + 2 Preta + 2 Vermelha"));
  assert.ok(rows.every((r) => r.quantity === 8));
  assert.ok(rows.every((r) => r.maxKits === 1));
  s.variants.forEach((v) => (v.stock = 0));
  assert.equal(generateKitCompositions(s).length, 0);
  s.variants[0].stock = 1.5;
  assert.equal(generateKitCompositions(s).length, 0);
  s.variants[0].stock = null;
  const unknown = evaluateKits(s);
  assert.ok(unknown.every((r) => r.stockConfirmed === false));
  assert.ok(unknown.every((r) => r.status !== "PILOT"));
});
test("kits: lucro reproduz comissão, tarifa, frete, embalagem, imposto e custo do roteiro", () => {
  const s = scenario(),
    rows = evaluateKits(s),
    r = find(rows, 8);
  assert.equal(r.purchaseCost, 36);
  assert.equal(r.financial.commissionAmount, 9.6);
  assert.equal(r.financial.fixedFee, 4);
  assert.equal(r.financial.shippingCost, 6.85);
  assert.equal(r.financial.operatingCost, 1.8);
  assert.equal(r.financial.taxAmount, 3.2);
  assert.equal(r.financial.profit, 18.55);
  assert.equal(r.financial.minimumSuggestedPrice, 76.02);
  assert.equal(find(rows, 2).status, "LOSS");
  assert.equal(rankKitResults(rows)[0].quantity, 8);
  assert.equal(r.status, "VALIDATE");
  assert.match(r.reason, /valide o preço/);
  s.unitCost = 8;
  assert.ok(find(evaluateKits(s), 8).financial.profit < 0);
});
test("kits: nulos não viram zero; zeros confirmados calculam e metas impossíveis ficam explícitas", () => {
  for (const key of [
    "unitCost",
    "taxPercent",
    "shippingCost",
    "packageCost",
    "commissionPercent",
    "fixedFee",
    "operatingCost",
  ]) {
    const s = scenario();
    s[key] = null;
    assert.equal(find(evaluateKits(s), 8).financial, null, key);
  }
  const s = scenario();
  s.taxPercent = 0;
  s.shippingCost = 0;
  s.packageCost = 0;
  s.operatingCost = 0;
  assert.ok(find(evaluateKits(s), 8).financial.profit > 18.55);
  s.targetMarginPercent = 80;
  s.commissionPercent = 30;
  const r = find(evaluateKits(s), 8);
  assert.equal(r.financial.minimumSuggestedPrice, null);
  assert.match(r.reason, /Meta inviável/);
});
test("kits: custos diferentes por cor e preço mínimo usam centavos sem arredondar a unidade antes do total", () => {
  const s = scenario();
  s.variants[1].unitCost = 5.25;
  const mixed = evaluateKits(s).find((r) => r.label === "2 Azul + 2 Preta");
  assert.equal(mixed.purchaseCost, 19.5);
  const bulk = {
    ...scenario(),
    unitCost: 0.0345,
    sizes: [1000],
    variants: [{ id: "branco", label: "Branco", stock: 5000, unitCost: null }],
    pricePerUnit: 0.1,
  };
  assert.equal(evaluateKits(bulk)[0].purchaseCost, 34.5);
  for (const r of evaluateKits(s))
    if (r.financial?.minimumSuggestedPrice) {
      const atFloor = {
        ...s,
        salePrices: [
          { quantity: r.quantity, price: r.financial.minimumSuggestedPrice },
        ],
      };
      const checked = evaluateKits(atFloor).find((x) => x.id === r.id);
      assert.ok(
        checked.financial.marginPercent >= s.targetMarginPercent - 0.005,
      );
      assert.ok(checked.financial.roiPercent >= s.targetRoiPercent - 0.005);
    }
});
test("kits: preço por custo não é preço de mercado e não cria demanda", () => {
  const s = scenario();
  s.pricePerUnit = null;
  const r = find(evaluateKits(s), 8);
  assert.equal(r.priceSource, "COST_FLOOR");
  assert.equal(r.market, null);
  assert.equal(r.financial.profit > 0, true);
  assert.equal(r.status, "VALIDATE");
  assert.equal(r.demand, undefined);
});
test("kits: cotação substitui as estimativas no piso escolhido e nova taxa muda o mínimo necessário", () => {
  const s = scenario();
  s.pricePerUnit = null;
  s.useApiQuotes = true;
  const now = Date.now(),
    trial = find(evaluateKits(s), 8);
  const quote = {
    context: kitQuoteContext(s, 8, trial.salePrice),
    accountId: "account-a",
    accountName: "Loja A",
    quotedAt: new Date(now).toISOString(),
    fee: {
      commissionPercent: 14,
      fixedFee: 4,
      saleFeeAmount: Math.round((trial.salePrice * 0.14 + 4) * 100) / 100,
    },
    shipping: { shippingCost: 6.85, discountRate: 0.5 },
    notices: [],
  };
  const result = find(evaluateKits(s, [], [quote], now, "account-a"), 8);
  assert.equal(result.feeSource, "ML_API_ESTIMATE");
  assert.equal(
    result.financial.commissionAmount,
    Math.round(trial.salePrice * 0.14 * 100) / 100,
  );
  assert.ok(result.financial.minimumSuggestedPrice > trial.salePrice);
});
test("kits: Baxmann simula 500, 1000 e 2000 peças sem confundir modelo e estoque", () => {
  const s = {
    ...scenario(),
    productName: "Ilhós Baxmann nº54 alumínio",
    brand: "Baxmann",
    model: "54",
    unitCost: 0.0345,
    sizes: [500, 1000, 2000],
    pricePerUnit: 0.1,
    variants: [
      { id: "branco", label: "Branco", stock: 2000, unitCost: null },
      { id: "dourado", label: "Dourado", stock: 2000, unitCost: null },
    ],
  };
  const rows = evaluateKits(s);
  for (const [quantity, cost] of [
    [500, 17.25],
    [1000, 34.5],
    [2000, 69],
  ])
    assert.equal(find(rows, quantity).purchaseCost, cost);
  assert.ok(rows.some((r) => r.label === "1000 Branco + 1000 Dourado"));
});
test("kits: cotação só vale para a conta, preço, pacote, tamanho e modalidade correspondentes", () => {
  const now = Date.now(),
    s = scenario();
  s.useApiQuotes = true;
  s.commissionPercent = null;
  s.fixedFee = null;
  s.shippingCost = null;
  s.unitWeightGrams = 10;
  s.packageWeightGrams = 20;
  s.dimensions = { heightCm: 5, widthCm: 10, lengthCm: 20 };
  const q = {
    context: kitQuoteContext(s, 8, 80),
    accountId: "account-a",
    accountName: "Loja A",
    quotedAt: new Date(now).toISOString(),
    fee: { commissionPercent: 12, fixedFee: 4, saleFeeAmount: 13.6 },
    shipping: { shippingCost: 6.85, discountRate: 0.5 },
    notices: [],
  };
  const valid = find(evaluateKits(s, [], [q], now, "account-a"), 8);
  assert.equal(valid.financial.profit, 18.55);
  assert.equal(valid.feeSource, "ML_API_ESTIMATE");
  assert.equal(valid.financial.shippingCost, 6.85);
  for (const change of [
    { accountId: "account-b" },
    { quotedAt: new Date(now - 300001).toISOString() },
    { context: { ...q.context, salePrice: 81 } },
    { context: { ...q.context, quantity: 4 } },
    { context: { ...q.context, listingType: "PREMIUM" } },
    { context: { ...q.context, logisticType: "fulfillment" } },
    {
      context: {
        ...q.context,
        shippingPackage: { ...q.context.shippingPackage, weightGrams: 101 },
      },
    },
  ])
    assert.equal(
      find(evaluateKits(s, [], [{ ...q, ...change }], now, "account-a"), 8)
        .financial,
      null,
    );
  assert.equal(
    find(evaluateKits(s, [], [q], now, "account-b"), 8).financial,
    null,
  );
});
test("kits: referência automática exige três ofertas recentes com mesma marca, modelo, quantidade e cor", () => {
  const s = scenario();
  s.pricePerUnit = null;
  const now = Date.now();
  const items = [56, 60, 64].map((price, i) => ({
    id: "MLB77700000" + i,
    title: "Kit 4 Canetas Fantasminha Montovani Azul",
    price,
    quantity: 4,
    quantitySource: "ATTRIBUTE",
    brand: "Montovani",
    model: "Fantasminha",
    color: "Azul",
    categoryId: "MLB1234",
    catalogProductId: null,
    isOwn: false,
    source: "ML_API",
    observedAt: new Date(now).toISOString(),
  }));
  const blue = evaluateKits(s, items, [], now).find(
    (r) => r.label === "4 Azul",
  );
  assert.equal(blue.market.median, 60);
  assert.equal(blue.salePrice, 60);
  assert.equal(blue.priceSource, "MARKET_SAMPLE");
  assert.equal(blue.status, "PILOT");
  const mixed = evaluateKits(s, items, [], now).find(
    (r) => r.parts.length === 4,
  );
  assert.equal(mixed.market, null);
  for (const extra of [
    { isOwn: true },
    { status: "paused" },
    { quantity: 10 },
    { color: "Preta" },
    { brand: "Outra" },
    { quantitySource: "TITLE" },
    { observedAt: new Date(now - 86400001).toISOString() },
  ]) {
    const altered = items.map((i) => ({ ...i, ...extra }));
    assert.equal(
      evaluateKits(s, altered, [], now).find((r) => r.label === "4 Azul")
        .market,
      null,
    );
  }
  assert.equal(
    evaluateKits(s, items.slice(0, 2), [], now).find(
      (r) => r.label === "4 Azul",
    ).market,
    null,
  );
  s.reviewedOffers = [{ kitId: mixed.id, itemIds: items.map((i) => i.id) }];
  assert.equal(
    evaluateKits(s, items, [], now).find((r) => r.id === mixed.id).market.count,
    3,
  );
});

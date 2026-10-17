import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";
import { marketModelAsset } from "../scripts/build-market-model.mjs";
const { assessMarket, compactMoney } = await loadTs(
  "../lib/market-assessment.ts",
);
const product = {
  id: "MLB1234567890",
  soldLower: 1000,
  soldHasPlus: true,
  price: 115.19,
};

test("público diferencia volume histórico sem transformar acumulado ou avaliações em ritmo", () => {
  for (const [soldLower, level, potential] of [
    [0, "BAIXA", "initial"],
    [99, "BAIXA", "initial"],
    [100, "MEDIA", "moderate"],
    [500, "ALTA", "favorable"],
    [5000, "EXCELENTE", "favorable"],
  ]) {
    const a = assessMarket({ ...product, soldLower });
    assert.equal(a.demand.level, level);
    assert.equal(a.potential.key, potential);
    assert.equal(a.demand.rate, null);
    assert.equal(a.demand.lowerBound, true);
    assert.match(a.demand.basis, /Faixa mínima/);
  }
  const noSales = assessMarket({ price: 100, reviews: 5000, rating: 5 });
  assert.equal(noSales.demand.level, null);
  assert.equal(noSales.reference, null);
  assert.equal(
    assessMarket({
      ...product,
      soldLower: null,
      bestSellerLabel: "Mais vendido",
    }).demand.rate,
    null,
  );
});
test("zero recente medido prevalece sobre grande acumulado, mas dados de outro anúncio não vazam", () => {
  const insight = {
    id: product.id,
    estimate: {
      method: "HISTORICO",
      windowDays: 30,
      salesPerDay: { value: 0 },
    },
  };
  assert.equal(assessMarket(product, insight).potential.title, "Pouco giro");
  assert.equal(
    assessMarket(product, { ...insight, id: "MLB9999999999" }).potential.title,
    "Bom potencial",
  );
  assert.equal(
    assessMarket(product, {
      ...insight,
      estimate: { ...insight.estimate, method: "OFICIAL" },
    }).demand.rate,
    null,
  );
});
test("referência bruta mantém o piso e nunca sugere receita histórica recebida", () => {
  const a = assessMarket({ ...product, price: 272.65, soldLower: 100 });
  assert.equal(a.reference.value, 27265);
  assert.equal(a.reference.text, "≥ R$ 27,2 mil");
  assert.match(a.reference.detail, /Não é faturamento recebido/);
  assert.equal(compactMoney(999999, true), "≥ R$ 999,9 mil");
  assert.equal(assessMarket({ ...product, price: Infinity }).reference, null);
  assert.equal(assessMarket({ ...product, soldLower: NaN }).reference, null);
  assert.equal(
    assessMarket({ ...product, rating: 3.5, reviews: 20 }).potential.title,
    "Atenção à qualidade",
  );
});
test("web e extensão executam o mesmo modelo e o asset publicado está atualizado", async () => {
  const asset = await readFile(
    new URL("../extension/market-model.js", import.meta.url),
    "utf8",
  );
  assert.equal(asset, marketModelAsset());
  const sandbox = {};
  vm.runInNewContext(asset, sandbox);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.RadarMarketModel.assessMarket(product))),
    assessMarket(product),
  );
});

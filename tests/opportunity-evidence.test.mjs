import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { opportunitySalesEvidence: evidence } = await loadTs(
  "../lib/opportunity-evidence.ts",
);
const { calculateSearchOpportunityScore: score } = await loadTs(
  "../lib/opportunity-intelligence.ts",
);
const input = {
  chosenItemId: "MLB1234567890",
  winnerItemId: "MLB1234567890",
  winnerSoldQuantity: 100,
  catalogSoldQuantity: 5000,
  itemDateCreated: "2020-01-01",
};
const scoring = {
  price: 100,
  medianPrice: 100,
  searchPosition: 1,
  soldQuantity: 1000,
  visits: null,
  dateCreated: null,
  freeShipping: true,
  logisticType: "fulfillment",
  catalogProductId: "MLB1234",
  listingTypeId: "gold_special",
  similarity: 1,
};
test("zero da oferta consultada não vira milhares de vendas de catálogo", () => {
  assert.deepEqual(evidence({ ...input, itemSoldQuantity: 0 }), {
    quantity: 0,
    source: "ITEMS_BULK",
    dateCreated: "2020-01-01",
  });
});
test("total de catálogo e oferta fallback não herdam a idade nem as vendas do vencedor", () => {
  const catalog = evidence({ ...input, chosenItemId: "MLB9999999999" });
  assert.equal(catalog.source, "CATALOG_PRODUCT");
  assert.equal(catalog.dateCreated, null);
  const a = score({
    ...scoring,
    soldQuantity: catalog.quantity,
    dateCreated: catalog.dateCreated,
  });
  assert.equal(a.salesPerDay, null);
  assert.equal(a.revenuePerMonth, null);
  assert.equal(a.demandLabel, "EXCELENTE");
  assert.equal(
    evidence({
      ...input,
      itemSoldQuantity: Infinity,
      winnerSoldQuantity: -1,
      catalogSoldQuantity: NaN,
    }).source,
    "UNAVAILABLE",
  );
});
test("busca usa as mesmas faixas históricas e ritmo zero prevalece sobre o acumulado", () => {
  assert.equal(score(scoring).demandLabel, "ALTA");
  assert.equal(score({ ...scoring, soldQuantity: 100 }).demandLabel, "MEDIA");
  const measured = score({
    ...scoring,
    soldQuantity: 5000,
    measuredSalesPerDay: 0,
  });
  assert.equal(measured.demandLabel, "BAIXA");
  assert.equal(measured.rhythm, "MEDIDO");
  assert.equal(measured.salesPerDay, 0);
});

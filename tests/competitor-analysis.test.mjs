import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const {
  kitQuantity,
  unitPrice,
  parseCompetitorQuery,
  safeMlLink,
  safeMlImage,
  classifyCompetitor,
} = await loadTs("../lib/competitor-analysis.ts");
const reference = {
  id: "MLB700000001",
  title: "Kit 2 Canetas Fantasminha Montovani Azul",
  price: 19.98,
  quantity: 2,
  brand: "Montovani",
  model: "Fantasminha",
  color: "Azul",
  categoryId: "MLB1234",
  catalogProductId: null,
};
test("concorrentes: normaliza kits e pacotes sem confundir modelo nº54 ou medida com quantidade", () => {
  for (const [title, expected] of [
    ["Kit 2 Canetas Fantasminha", 2],
    ["Caneta Montovani 4 unidades", 4],
    ["Ilhós nº54 Baxmann pacote 1.000 peças", 1000],
    ["Ilhós Baxmann nº54 500 peças", 500],
    ["Ilhós nº54 2.000 un", 2000],
    ["Ilhós nº54 Baxmann", null],
    ["Fio 165m 2mm", null],
    ["Kit 2 com 4 unidades", null],
  ])
    assert.equal(kitQuantity(title).quantity, expected, title);
  assert.deepEqual(
    kitQuantity("Kit 2", [{ id: "UNITS_PER_PACK", value_name: "4" }]),
    { quantity: 4, source: "ATTRIBUTE" },
  );
  assert.equal(
    kitQuantity("Kit 2", [
      { id: "UNITS_PER_PACK", value_name: "2" },
      { id: "NUMBER_OF_UNITS", value_name: "4" },
    ]).quantity,
    null,
  );
});
test("concorrentes: preço unitário mantém precisão em pacotes grandes e não completa ausências", () => {
  assert.equal(unitPrice(19.98, 2), 9.99);
  assert.equal(unitPrice(59.99, 2000), 0.03);
  assert.equal(unitPrice(null, 2), null);
  assert.equal(unitPrice(10, null), null);
  assert.equal(unitPrice(0, 2), null);
  assert.equal(unitPrice(10, 0), null);
});
test("concorrentes: links só extraem IDs de hosts autorizados e nunca abrem URL arbitrária", () => {
  assert.equal(parseCompetitorQuery("MLB-700000001").id, reference.id);
  assert.equal(
    parseCompetitorQuery(
      "https://produto.mercadolivre.com.br/MLB-700000001-caneta",
    ).id,
    reference.id,
  );
  assert.equal(
    parseCompetitorQuery(
      "https://www.mercadolivre.com.br/produto/p/MLB88800001?wid=MLB700000001",
    ).id,
    reference.id,
  );
  assert.equal(
    parseCompetitorQuery(
      "https://www.mercadolivre.com.br/produto/p/MLB88800001",
    ).catalog,
    true,
  );
  for (const value of [
    "http://127.0.0.1/MLB700000001",
    "https://mercadolivre.com.br.evil.test/MLB700000001",
    "https://user@mercadolivre.com.br/MLB700000001",
    "https://mercadolivre.com.br:3000/MLB700000001",
    "https://meli.la/abc",
  ])
    assert.throws(() => parseCompetitorQuery(value), undefined, value);
  assert.equal(safeMlLink("javascript:alert(1)"), null);
  assert.equal(safeMlImage("https://private.test/a.png"), null);
  assert.equal(
    safeMlImage("http://http2.mlstatic.com/a.jpg"),
    "https://http2.mlstatic.com/a.jpg",
  );
});
test("concorrentes: marca, modelo, cor e quantidade alteram a correspondência e a justificativa", () => {
  assert.equal(classifyCompetitor(reference, reference).level, "SAME");
  assert.equal(
    classifyCompetitor(reference, { ...reference, id: "MLB700000002" }).level,
    "EQUIVALENT",
  );
  const differentKit = classifyCompetitor(reference, {
    ...reference,
    id: "MLB700000003",
    title: "Kit 10 Canetas Fantasminha Montovani Azul",
    quantity: 10,
  });
  assert.equal(differentKit.comparable, false);
  assert.match(differentKit.reasons.join(" "), /Quantidades diferentes/);
  for (const key of ["brand", "model", "color"])
    assert.equal(
      classifyCompetitor(reference, {
        ...reference,
        id: "MLB700000004",
        [key]: "Outro",
      }).comparable,
      false,
    );
  assert.equal(
    classifyCompetitor(reference, {
      ...reference,
      id: "MLB700000004",
      brand: null,
      model: null,
    }).level,
    "SIMILAR",
  );
  assert.equal(
    classifyCompetitor(reference, {
      ...reference,
      id: "MLB700000004",
      color: null,
    }).comparable,
    false,
  );
});

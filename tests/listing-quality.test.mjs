import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { diagnoseListing, competitorTerms, checkSuggestedTitle } = await loadTs("../lib/listing-quality.ts");

const item = {
  title: "Ilhós nº54 dourado",
  pictures: 2,
  attributes: [{ id: "BRAND", name: "Marca", value: "Baxmann" }],
  description: "",
  hasWarranty: false,
  freeShipping: false,
  price: 42.9,
};
const category = [
  { id: "BRAND", name: "Marca", valueType: "string", required: true, hidden: false, values: [], hint: null },
  { id: "MODEL", name: "Modelo", valueType: "string", required: true, hidden: false, values: [], hint: null },
  { id: "MATERIAL", name: "Material", valueType: "list", required: false, hidden: false, values: [{ id: "1", name: "Alumínio" }], hint: null },
  { id: "GTIN", name: "Código universal", valueType: "string", required: false, hidden: false, values: [], hint: null },
  { id: "INTERNAL", name: "Interno", valueType: "string", required: false, hidden: true, values: [], hint: null },
];
const rivals = [
  "Ilhós 54 Baxmann Alumínio Pacote 1000 Unidades",
  "Ilhós Nº54 Alumínio Dourado Para Banner",
  "Ilhos 54 Aluminio Prata Banner Lona",
  "Ilhós Alumínio 54 Dourado 500 Peças",
];

test("aponta o que falta e o que os concorrentes usam", () => {
  const r = diagnoseListing({ item, category, competitorTitles: rivals });
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.equal(by.TITULO.status, "warn");
  assert.equal(by.FOTOS.status, "bad");
  assert.equal(by.FICHA.status, "bad");
  assert.match(by.FICHA.detail, /Modelo/);
  assert.equal(by.DESCRICAO.status, "bad");
  assert.equal(by.GTIN.status, "warn");
  assert.ok(r.competitorTerms.includes("alumínio"));
  assert.ok(r.competitorTerms.includes("banner"));
  assert.deepEqual(r.missingAttributes.map((a) => a.id), ["MODEL", "MATERIAL"]);
  assert.ok(r.score < 40);
});

test("anúncio completo fica verde e poucos concorrentes não geram palavras", () => {
  const full = {
    ...item,
    title: "Ilhós Nº54 Dourado Alumínio Baxmann Pacote 1000 Unidades",
    pictures: 8,
    attributes: ["BRAND", "MODEL", "MATERIAL", "GTIN"].map((id) => ({ id, name: id, value: "x" })),
    description: "x".repeat(400),
    hasWarranty: true,
  };
  const r = diagnoseListing({ item: full, category, competitorTitles: rivals.slice(0, 2) });
  assert.equal(r.score, 100);
  assert.deepEqual(competitorTerms("a", ["b"]), []);
});

test("título da IA: limite de 60 e nada de número inventado", () => {
  assert.equal(checkSuggestedTitle("Ilhós Nº54 Dourado Alumínio Baxmann", ["Ilhós nº54 dourado"]).ok, true);
  assert.equal(checkSuggestedTitle("Ilhós Nº54 Dourado Pacote 1000 Unidades", ["Ilhós nº54 dourado"]).ok, false);
  assert.equal(checkSuggestedTitle("x".repeat(61), []).ok, false);
});

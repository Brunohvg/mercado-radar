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

const { normalizePerformance, normalizePriceSuggestion } = await loadTs("../lib/listing-quality.ts");

test("nota oficial do ML: pendências com link, avisos primeiro", () => {
  const raw = {
    score: 62.4, level: "Average", level_wording: "Satisfatória", calculated_at: "2026-11-20T10:00:00Z",
    buckets: {
      CHARACTERISTICS: { variables: {
        GTIN: { title: "Informe o código", rules: { HAS_GTIN: { status: "PENDING", mode: "OPPORTUNITY", wordings: { title: "Informe o código universal", label: "Ajuda a aparecer no catálogo", link: "https://www.mercadolivre.com.br/anuncios/MLB1/modificar" } } } },
        PICTURES: { rules: { PICTURES_QUANTITY_MIN: { status: "PENDING", mode: "WARNING", wordings: { title: "Adicione fotos" } } } },
      } },
      OFFER: { variables: { FREE_SHIPPING: { rules: { X: { status: "COMPLETED", wordings: { title: "ok" } } } } } },
    },
  };
  const r = normalizePerformance(raw);
  assert.equal(r.score, 62);
  assert.equal(r.level, "Satisfatória");
  assert.deepEqual(r.pending.map((p) => p.title), ["Adicione fotos", "Informe o código universal"]);
  assert.match(r.pending[1].link, /mercadolivre/);
  assert.equal(normalizePerformance({ error: "not_found" }), null);
});

test("sugestão de preço do ML lida de forma defensiva", () => {
  assert.deepEqual(normalizePriceSuggestion({ suggested_price: { amount: 39.9 }, lowest_price: { amount: 35 }, current_price: { amount: 42.9 } }), { suggested: 39.9, lowest: 35, current: 42.9 });
  assert.equal(normalizePriceSuggestion({ status: "no_suggestion" }), null);
});

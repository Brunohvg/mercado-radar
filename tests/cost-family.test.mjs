import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { packQuantity, familyTokens, suggestCosts } = await loadTs("../lib/cost-family.ts");

test("lê a quantidade de kits e pacotes", () => {
  assert.equal(packQuantity("Kit 2 Arames Para Encadernação Wire-o 2x1 A4 Preto"), 2);
  assert.equal(packQuantity("Kit 4 Arames Wire-o 2x1 A4 Branco"), 4);
  assert.equal(packQuantity("Ilhós No 54 Baxmann Em Alumínio Pacote Com 1.000 Unidades"), 1000);
  assert.equal(packQuantity("Ilhós Nº 54 Prata 500 Unidades"), 500);
  assert.equal(packQuantity("Kit 2 Pacotes Ilhós 54 Com 500 Unidades"), 1000);
  assert.equal(packQuantity("Alicate Para Ilhós Profissional"), 1);
  assert.equal(packQuantity("Kit 10mm Broca"), 1);
});

test("cor e quantidade não mudam a família", () => {
  const a = [...familyTokens("Kit 2 Arames Wire-o 2x1 A4 Preto")].sort();
  const b = [...familyTokens("Kit 4 Arames Wire-o 2x1 A4 Branco")].sort();
  assert.deepEqual(a, b);
});

test("sugere custo proporcional para o kit maior, com a origem", () => {
  const s = suggestCosts([
    { mlItemId: "A", title: "Kit 2 Arames Wire-o 2x1 A4 Preto", netCost: 8 },
    { mlItemId: "B", title: "Kit 4 Arames Wire-o 2x1 A4 Branco", netCost: null },
    { mlItemId: "C", title: "Ilhós Nº 54 Dourado Pacote 1.000 Unidades", netCost: 24.5 },
    { mlItemId: "D", title: "Ilhós Nº 54 Prata 500 Unidades", netCost: null },
    { mlItemId: "E", title: "Alicate Para Ilhós Profissional", netCost: null },
  ]);
  assert.equal(s.get("B").supplierPrice, 16);
  assert.equal(s.get("B").fromMlItemId, "A");
  assert.match(s.get("B").reason, /Mesma família/);
  assert.equal(s.get("D").supplierPrice, 12.25);
  assert.equal(s.has("E"), false);
  assert.equal(s.has("A"), false);
});

test("mesmo catálogo vale mesmo com título diferente; famílias distintas não se misturam", () => {
  const s = suggestCosts([
    { mlItemId: "A", title: "Ilhós 54 alumínio", catalogProductId: "MLB1", netCost: 20 },
    { mlItemId: "B", title: "Ilhoses Baxmann linha premium", catalogProductId: "MLB1", netCost: null },
    { mlItemId: "C", title: "Arame Wire-o 3x1 Ofício", netCost: null },
  ]);
  assert.equal(s.get("B").supplierPrice, 20);
  assert.equal(s.get("B").match, "MESMO_PRODUTO");
  assert.equal(s.has("C"), false);
});

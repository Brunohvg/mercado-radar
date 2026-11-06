import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

test("peso e dimensões de fontes externas têm unidades normalizadas", async () => {
  const { DIMENSION_IDS, numberFromAttribute } = await loadTs("../lib/ml-physical-measures.ts");
  const value = (id, number, unit) =>
    numberFromAttribute([{ id, value_struct: { number, unit } }], id);
  assert.equal(value(DIMENSION_IDS.weight, .25, "kg"), 250);
  assert.equal(value(DIMENSION_IDS.weight, 200, "g"), 200);
  assert.equal(value(DIMENSION_IDS.height, 120, "mm"), 12);
  assert.equal(value(DIMENSION_IDS.length, .2, "m"), 20);
  assert.equal(value(DIMENSION_IDS.width, 18, "cm"), 18);
  assert.equal(value(DIMENSION_IDS.weight, 9, "lb"), null);
  assert.equal(value(DIMENSION_IDS.height, 400, "cm"), null);
  assert.equal(numberFromAttribute([{ id: DIMENSION_IDS.weight, value_name: "0,5 kg" }], DIMENSION_IDS.weight), 500);
  assert.equal(numberFromAttribute([], DIMENSION_IDS.weight), null);
});

test("medidas e foto de IA são estimativas não publicáveis sem confirmação", async () => {
  const read = name => readFile(new URL("../" + name, import.meta.url), "utf8");
  const [estimate, photo, discovery, ui, manager, draft, publish] = await Promise.all([
    read("app/api/ai/packaging-estimate/route.ts"),
    read("app/api/ai/photo-facts/route.ts"),
    read("app/api/ml/product-discovery/route.ts"),
    read("components/listing-draft-assistant.tsx"),
    read("components/listing-draft-manager.tsx"),
    read("app/api/listing-drafts/route.ts"),
    read("app/api/listing-drafts/publication/route.ts"),
  ]);
  assert.ok(estimate.includes("generatePackagingEstimate"));
  assert.ok(estimate.includes('source: "AI_ESTIMATE"'));
  assert.ok(photo.includes("extractPhotoFacts"));
  assert.ok(photo.includes("user.workspaceId"));
  assert.ok(discovery.includes("numberFromAttribute"));
  assert.ok(ui.includes('"/api/ai/packaging-estimate"'));
  assert.ok(ui.includes('"/api/ai/listing-draft"'));
  assert.ok(ui.includes('source: "AI_ESTIMATE"'));
  assert.ok(manager.includes('"/api/ai/photo-facts"'));
  assert.ok(manager.includes("Conferi a embalagem"));
  assert.ok(draft.includes("packageMeasurementsConfirmed: z.boolean().default(false)"));
  assert.ok(publish.includes("if (!data.packageMeasurementsConfirmed)"));
});

test("MLBU resolve oferta do próprio vendedor sem confundir produto com anúncio", async () => {
  const source = await readFile(new URL("../app/api/extension/profitability/route.ts", import.meta.url), "utf8");
  assert.ok(source.includes("getUserProductDetails"));
  assert.ok(source.includes("getItemsByUserProduct"));
  assert.ok(source.includes("String(product.user_id ??"));
  assert.ok(source.includes("ids.length === 1"));
  assert.ok(source.includes("itemId: listingItemId!"));
});

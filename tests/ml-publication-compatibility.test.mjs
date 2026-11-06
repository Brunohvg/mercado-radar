import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

test("Legacy and User Products require distinct title payloads", async () => {
  const { buildPublicationBody, sellerPublicationModel } = await loadTs("../lib/ml-publication-model.ts");
  assert.equal(sellerPublicationModel(["user_product_seller", "normal"]), "USER_PRODUCTS");
  assert.equal(sellerPublicationModel(["normal"]), "LEGACY");
  assert.throws(() => sellerPublicationModel(null), /tags válidas/);
  const base = {
    channel: "TRADITIONAL", title: "Verniz Acrílico Acrilex 100ml",
    categoryId: "MLB249466", price: 29.9, stock: 3, listingType: "CLASSIC",
    pictures: [{ id: "foto123" }], attributes: [{ id: "BRAND", value_name: "Acrilex" }],
    freeShipping: false, catalogProductId: null, catalogExactMatchConfirmed: false,
  };
  const legacy = buildPublicationBody({ ...base, model: "LEGACY" });
  const modern = buildPublicationBody({ ...base, model: "USER_PRODUCTS" });
  assert.equal(legacy.title, base.title);
  assert.equal(legacy.family_name, undefined);
  assert.equal(modern.family_name, base.title);
  assert.equal(modern.title, undefined);
  assert.equal(modern.status, "paused");
  assert.equal(modern.catalog_listing, undefined);
  assert.equal(modern.available_quantity, 3);
});

test("Catalog posts require explicit product match and valid catalog identifier", async () => {
  const { buildPublicationBody } = await loadTs("../lib/ml-publication-model.ts");
  const base = {
    model: "USER_PRODUCTS", channel: "CATALOG", title: "Verniz 100ml",
    categoryId: "MLB249466", price: 29.9, stock: 2,
    listingType: "CLASSIC", pictures: [], attributes: [],
    freeShipping: false, catalogProductId: "MLBU1234",
  };
  assert.throws(() => buildPublicationBody({ ...base, catalogExactMatchConfirmed: false }), /confirme/);
  assert.throws(() => buildPublicationBody({ ...base, catalogProductId: "MLBbad", catalogExactMatchConfirmed: true }), /confirme/);
  const candidate = buildPublicationBody({ ...base, catalogExactMatchConfirmed: true });
  assert.equal(candidate.catalog_product_id, "MLBU1234");
  assert.equal(candidate.catalog_listing, true);
});

test("Website and extension consult a shared seller capabilities module", async () => {
  const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
  const [base, web, extension, publication, panel] = await Promise.all([
    read("lib/ml-publication-capabilities.ts"),
    read("app/api/ml/publication-capabilities/route.ts"),
    read("app/api/extension/publication-capabilities/route.ts"),
    read("app/api/listing-drafts/publication/route.ts"),
    read("extension/sidepanel.js"),
  ]);
  assert.ok(base.includes("user_product_seller") || base.includes("sellerPublicationModel"));
  assert.ok(web.includes("loadSellerPublicationCapabilities"));
  assert.ok(extension.includes("getExtensionSession(request)"));
  assert.ok(extension.includes("loadSellerPublicationCapabilities"));
  assert.ok(publication.includes("loadSellerPublicationCapabilities"));
  assert.ok(publication.includes("RADAR_ENABLE_PUBLISHING"));
  assert.ok(panel.includes("/api/extension/publication-capabilities"));
});

test("Chrome extension versions stay in sync with installers", async () => {
  const [manifest, production, html, page] = await Promise.all([
    readFile(new URL("../extension/manifest.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../extension/manifest.prod.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../extension/sidepanel.html", import.meta.url), "utf8"),
    readFile(new URL("../app/extensao/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.equal(manifest.version, production.version);
  assert.ok(html.includes(manifest.version));
  assert.ok(page.includes(manifest.version));
});

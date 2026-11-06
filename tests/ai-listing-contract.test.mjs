import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Gemini credentials remain server-side and there is no paid provider fallback", async () => {
  const lib = await readFile(new URL("../lib/ai/gemini-listing.ts", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/ai/listing-draft/route.ts", import.meta.url), "utf8");
  assert.match(lib, /process\.env\.GEMINI_API_KEY/);
  assert.match(lib, /generativelanguage\.googleapis\.com/);
  assert.doesNotMatch(lib, /api\.x\.ai|api\.openai\.com/);
  assert.match(api, /await requireUser\(\)/);
  assert.match(api, /geminiIsConfigured/);
  assert.match(api, /requiresReview: true/);
});


test("Modelo Gemini default atual e thinking level compatível", async () => {
  const lib = await readFile(new URL("../lib/ai/gemini-listing.ts", import.meta.url), "utf8");
  const compose = await readFile(new URL("../docker-compose.yml", import.meta.url), "utf8");
  assert.ok(lib.includes("gemini-3.5-flash-lite"));
  assert.match(lib, /thinkingLevel: "MINIMAL"/);
  assert.ok(compose.includes("GEMINI_MODEL:-gemini-3.5-flash-lite"));
});


test("EAN sem identidade não gera texto genérico e instalador oferece Linux", async () => {
  const api = await readFile(new URL("../app/api/ai/listing-draft/route.ts", import.meta.url), "utf8");
  const discovery = await readFile(new URL("../app/api/ml/product-discovery/route.ts", import.meta.url), "utf8");
  const linux = await readFile(new URL("../app/api/extension/linux-installer/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/extensao/page.tsx", import.meta.url), "utf8");
  assert.ok(api.includes("PRODUCT_IDENTITY_REQUIRED"));
  assert.ok(discovery.includes("requiresProductName: true"));
  assert.ok(linux.includes("base64 --decode"));
  assert.ok(linux.includes("ExtensionBeta"));
  assert.ok(page.includes("/api/extension/linux-installer"));
});

test("catalog mandatory rules are checked and never silently published traditionally", async () => {
  const ml = await readFile(new URL("../lib/mercado-livre.ts", import.meta.url), "utf8");
  const discovery = await readFile(new URL("../app/api/ml/product-discovery/route.ts", import.meta.url), "utf8");
  const publish = await readFile(new URL("../app/api/listing-drafts/publication/route.ts", import.meta.url), "utf8");
  assert.ok(ml.includes("listing_strategy?: string"));
  assert.ok(discovery.includes("CATALOG_REQUIRED"));
  assert.ok(discovery.includes("PARENT_PRODUCT"));
  assert.ok(publish.includes("Este produto exige catálogo."));
  assert.ok(publish.includes("RADAR_ENABLE_PUBLISHING"));
});

test("precificacao usa a mesma base para Classico e Premium e nao perde a regra de frete", async () => {
  const api = await readFile(new URL("../app/api/ml/suggest-price/route.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../components/listing-draft-assistant.tsx", import.meta.url), "utf8");
  assert.ok(api.includes("const otherType = input.listingType === \"CLASSIC\""));
  assert.ok(api.includes("price: candidate, listingType: otherType"));
  assert.ok(api.includes("const effectiveFreeShipping = candidate >= 79 ? true"));
  assert.ok(api.includes("shippingCostKind: \"ESTIMATE_NET_AFTER_DISCOUNT\""));
  assert.ok(ui.includes("Clássico × Premium, mesmo preço"));
});

test("rascunho pode ser salvo sem resposta do Mercado Livre e ficha tecnica e preflight", async () => {
  const drafts = await readFile(new URL("../app/api/listing-drafts/route.ts", import.meta.url), "utf8");
  const preflight = await readFile(new URL("../app/api/listing-drafts/publication/route.ts", import.meta.url), "utf8");
  assert.ok(drafts.includes("Saving must never depend on a remote Mercado Livre response."));
  assert.ok(drafts.includes("factsReviewed: z.boolean().default(false)"));
  assert.ok(preflight.includes('status: { in: ["DRAFT", "REVIEW", "VALIDATED"] }'));
  assert.ok(preflight.includes("Não foi possível confirmar a logística da conta vendedora."));
  assert.ok(preflight.includes("const effectiveFreeShipping = data.suggestedPrice >= 79"));
});

test("opcoes de logistica da conta e categorias verificadas sem lista inventada", async () => {
  const shipping = await readFile(new URL("../app/api/ml/seller-shipping/route.ts", import.meta.url), "utf8");
  const category = await readFile(new URL("../app/api/ml/product-discovery/route.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../components/listing-draft-assistant.tsx", import.meta.url), "utf8");
  assert.ok(shipping.includes("/shipping_preferences"));
  assert.ok(shipping.includes("getMlSession()"));
  assert.ok(category.includes("path_from_root"));
  assert.ok(ui.includes('shippingPreferences?.choices.map'));
  assert.ok(ui.includes("item.path || item.categoryName"));
});


test("extension uses its bundled deployment and does not ask sellers for server URL", async () => {
  const background = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
  const panel = await readFile(new URL("../extension/sidepanel.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../extension/sidepanel.html", import.meta.url), "utf8");
  assert.ok(background.includes("const DEFAULT_API_BASE = \"https://radar.optarys.com.br\""));
  assert.ok(background.includes("return url.origin"));
  assert.ok(!background.includes('chrome.storage.sync.get(["radarApiBase"])'));
  assert.ok(!panel.includes('chrome.storage.sync.set({ radarApiBase:'));
  assert.ok(!html.includes('id="apiBase"'));
  assert.ok(!html.includes('id="saveServer"'));
});


test("existing vendor logs into extension without a second Mercado Livre OAuth", async () => {
  const route = await readFile(new URL("../app/api/extension/auth/start/route.ts", import.meta.url), "utf8");
  const background = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
  assert.ok(route.includes("getWorkspaceMlAccount(user.workspaceId)"));
  assert.ok(route.includes("createExtensionAuthorizationCode"));
  assert.ok(!route.includes("https://auth.mercadolivre.com.br/authorization"));
  assert.ok(background.includes("ml_account_required"));
});


test("seller OAuth requests write and publication origin uses trusted external URL", async () => {
  const authorization = await readFile(new URL("../app/api/integrations/mercadolivre/authorize/route.ts", import.meta.url), "utf8");
  const publication = await readFile(new URL("../app/api/listing-drafts/publication/route.ts", import.meta.url), "utf8");
  const status = await readFile(new URL("../app/api/integrations/mercadolivre/status/route.ts", import.meta.url), "utf8");
  assert.ok(authorization.includes('"read write offline_access"'));
  assert.ok(publication.includes("getPublicOrigin(request)"));
  assert.ok(!publication.includes('origin !== new URL(request.url).origin'));
  assert.ok(status.includes("publishingScopeAuthorized"));
});

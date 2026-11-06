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

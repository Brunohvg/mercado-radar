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

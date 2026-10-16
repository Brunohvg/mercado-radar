import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { loadTs } from "./load-ts.mjs";
const estimates = await loadTs("../lib/market-estimates.ts");
const comparison = await loadTs("../lib/market-comparison.ts");
const permissions = await loadTs("../lib/ml-capabilities.ts");
const sandbox = {
  location: {
    href: "https://www.mercadolivre.com.br/produto/up/MLBU5074600649",
  },
  URL,
};
vm.createContext(sandbox);
vm.runInContext(
  await readFile(new URL("../extension/selectors.js", import.meta.url), "utf8"),
  sandbox,
);
vm.runInContext(
  await readFile(
    new URL("../extension/panel-model.js", import.meta.url),
    "utf8",
  ),
  sandbox,
);
const S = sandbox.RadarSelectors,
  M = sandbox.RadarPanelModel;

test("UP, catálogo e anúncio são referências distintas", () => {
  assert.equal(
    S.idsFromHref("https://www.mercadolivre.com.br/fio/up/MLBU5074600649")
      .userProductId,
    "MLBU5074600649",
  );
  assert.equal(
    S.idsFromHref("https://www.mercadolivre.com.br/fio/p/MLB12345678").itemId,
    null,
  );
  assert.equal(
    S.idsFromHref(
      "https://www.mercadolivre.com.br/fio/p/MLB12345678?pdp_filters=item_id%3AMLB1234567890",
    ).itemId,
    "MLB1234567890",
  );
  assert.equal(
    S.idsFromHref("https://produto.mercadolivre.com.br/MLB-1234567890-fio-_JM")
      .itemId,
    "MLB1234567890",
  );
  assert.equal(S.currentReference(), "MLBU5074600649");
});
test("faixa pública não recebe teto inventado", () => {
  assert.deepEqual(estimates.soldRangeFromLabel(25, true), {
    lower: 25,
    upper: null,
  });
  assert.deepEqual(estimates.soldRangeFromLabel(25, false), {
    lower: 25,
    upper: 25,
  });
});
test("avaliações, acumulado e ID não viram vendas ou visitas privadas", () => {
  const estimate = estimates.estimateItem({
    price: 17.9,
    age: { days: 15, source: "ID_ESTIMADO" },
    now: new Date("2026-10-16"),
    observations: [
      { at: new Date("2026-10-01"), soldLower: 25, reviews: 1 },
      { at: new Date("2026-10-16"), soldLower: 25, reviews: 4 },
    ],
  });
  assert.equal(estimate.salesPerDay.value, null);
  assert.equal(estimate.visitsPerDay.value, null);
  assert.equal(estimate.revenuePerDay.value, null);
  assert.equal(estimate.ageDays.value, null);
  assert.equal(estimates.demandFrom(estimate), null);
  assert.equal(estimates.marketScore({ estimate }), null);
});
test("pedidos oficiais sem visitas não recebem conversão fictícia de tráfego", () => {
  const e = estimates.estimateItem({
    price: 100,
    age: null,
    observations: [],
    official: { unitsInWindow: 30, windowDays: 30 },
  });
  assert.equal(e.method, "OFICIAL");
  assert.equal(e.salesPerDay.value, 1);
  assert.equal(e.visitsPerDay.value, null);
});
test("histórico usa contador exato e uma janela datada", () => {
  const e = estimates.estimateItem({
    price: 20,
    age: null,
    now: new Date("2026-10-16"),
    observations: [
      { at: new Date("2026-10-01"), soldExact: 100 },
      { at: new Date("2026-10-16"), soldExact: 130 },
    ],
  });
  assert.equal(e.method, "HISTORICO");
  assert.equal(e.salesPerDay.value, 2);
  assert.equal(e.windowDays, 15);
  assert.equal(e.visitsPerDay.value, null);
});
test("queda de contador não é venda negativa nem velocidade confirmada", () => {
  const e = estimates.estimateItem({
    price: 20,
    age: null,
    now: new Date("2026-10-16"),
    observations: [
      { at: new Date("2026-10-01"), soldExact: 130 },
      { at: new Date("2026-10-16"), soldExact: 100 },
    ],
  });
  assert.equal(e.salesPerDay.value, null);
});
test("comparação rejeita quantidade e medida diferentes", () => {
  assert.equal(
    comparison.comparableTitle(
      "Kit 1000 Ilhós Baxmann Nº54",
      "Kit 100 Ilhós Baxmann Nº54",
    ).accepted,
    false,
  );
  assert.equal(
    comparison.comparableTitle(
      "Fio encerado 165 metros 2mm",
      "Fio encerado 165m 2mm preto",
    ).accepted,
    true,
  );
  assert.equal(
    comparison.comparableTitle("Fio encerado 165m 2mm", "Fio encerado 165m 1mm")
      .accepted,
    false,
  );
  assert.equal(
    comparison.comparableTitle(
      "Kit tinta tecido Acrilex",
      "Tinta tecido Acrilex",
    ).accepted,
    false,
  );
});
test("faixa de preço exige três candidatos e preserva mediana", () => {
  assert.equal(comparison.priceSample([10, 20], 15), null);
  assert.equal(M.sample([10, 20], 15), null);
  assert.equal(comparison.priceSample([20, 10, 30], 25).median, 20);
  assert.equal(M.sample([20, 10, 30], 25).gap, 25);
});
test("valores brasileiros, zero explícito e ausência são distintos", () => {
  for (const [raw, expected] of [
    ["10,90", 10.9],
    ["1.234,56", 1234.56],
    ["0", 0],
    ["", null],
    ["-1", null],
    ["Infinity", null],
    ["12,345", null],
  ])
    assert.equal(M.money(raw), expected, raw);
});
test("403 não vira exigência automática de reconexão ou grant garantido", () => {
  assert.equal(permissions.capabilityState(403), "RESTRICTED");
  assert.equal(permissions.capabilityState(401), "RECONNECT");
  assert.equal(permissions.capabilityState(0, false), "NOT_TESTED");
  assert.equal(permissions.capabilityState(429), "RATE_LIMITED");
  assert.match(
    permissions.capabilityGuidance("RESTRICTED", true),
    /Reconectar não garante/,
  );
});

const backgroundSource = await readFile(
  new URL("../extension/background.js", import.meta.url),
  "utf8",
);
async function backgroundHarness() {
  let listener,
    activeId = 1;
  const opened = [],
    sessionWrites = [],
    contexts = new Map([
      [1, { title: "A" }],
      [2, { title: "B" }],
    ]);
  const local = {},
    sync = {},
    removed = [],
    fetches = [];
  const scope = {
    URL,
    Uint8Array,
    TextEncoder,
    crypto: globalThis.crypto,
    btoa,
    AbortSignal,
    setTimeout,
    clearTimeout,
    fetch: async (...args) => {
      fetches.push(args);
      return new Response("{}", {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    },
    chrome: {
      runtime: {
        id: "a".repeat(32),
        onInstalled: { addListener() {} },
        onMessage: {
          addListener(fn) {
            listener = fn;
          },
        },
      },
      sidePanel: {
        setPanelBehavior: async () => {},
        open: async (value) => {
          opened.push(value);
        },
      },
      tabs: {
        query: async () => [{ id: activeId }],
        sendMessage: async (id) => {
          if (!contexts.has(id)) throw new Error("No content adapter");
          return contexts.get(id);
        },
        onRemoved: { addListener() {} },
      },
      storage: {
        sync: {
          get: async () => sync,
          set: async (value) => Object.assign(sync, value),
          remove: async () => {},
        },
        local: {
          get: async () => local,
          set: async (value) => Object.assign(local, value),
          remove: async (keys) => {
            removed.push(...keys);
            for (const k of keys) delete local[k];
          },
        },
        session: {
          set: async (value) => sessionWrites.push(value),
          remove: async () => {},
        },
      },
    },
  };
  vm.createContext(scope);
  vm.runInContext(backgroundSource, scope);
  return {
    scope,
    opened,
    sessionWrites,
    local,
    sync,
    removed,
    fetches,
    activate: (id) => {
      activeId = id;
    },
    call: (message, sender = { id: "a".repeat(32) }) =>
      new Promise((resolve) => listener(message, sender, resolve)),
    listener: (...args) => listener(...args),
  };
}
test("background uses the active tab and never falls back to another tab's product", async () => {
  const h = await backgroundHarness();
  assert.equal((await h.call({ type: "RADAR_CONTEXT_GET" })).title, "A");
  h.activate(2);
  assert.equal((await h.call({ type: "RADAR_CONTEXT_GET" })).title, "B");
  h.activate(3);
  assert.equal(await h.call({ type: "RADAR_CONTEXT_GET" }), null);
});
test("native panel opening stays in the user gesture and page messages are origin scoped", async () => {
  const h = await backgroundHarness();
  const result = h.call(
    { type: "RADAR_OPEN_PANEL" },
    { id: "a".repeat(32), tab: { id: 1 } },
  );
  assert.equal(h.opened.length, 1);
  assert.equal((await result).ok, true);
  assert.equal(
    (
      await h.call(
        { type: "RADAR_CONTEXT_UPDATE", context: { title: "bad" } },
        { id: "a".repeat(32), tab: { id: 1 }, url: "https://other.test/" },
      )
    ).ok,
    false,
  );
  assert.equal(h.sessionWrites.length, 0);
  const r = await h.call({
    type: "RADAR_FETCH",
    path: "/api/workspace/clients",
    method: "POST",
  });
  assert.equal(r.ok, false);
  assert.equal(h.fetches.length, 0);
});
test("transient auth failure does not delete a refresh token", async () => {
  const h = await backgroundHarness();
  Object.assign(h.local, {
    radarRefreshToken: "refresh-still-valid",
    radarAccessTokenExpiresAt: 0,
  });
  await h.call({ type: "RADAR_AUTH_STATUS" });
  assert.equal(h.local.radarRefreshToken, "refresh-still-valid");
  assert.equal(h.removed.length, 0);
});
test("changing server cannot forward a Radar token to another origin", async () => {
  const h = await backgroundHarness();
  h.sync.radarApiBase = "http://localhost:3000";
  Object.assign(h.local, {
    radarAuthOrigin: "https://radar.optarys.com.br",
    radarRefreshToken: "prod-token",
    radarAccessToken: "prod-access",
    radarAccessTokenExpiresAt: Date.now() + 999999,
  });
  assert.equal(
    (await h.call({ type: "RADAR_AUTH_STATUS" })).authenticated,
    false,
  );
  assert.equal(h.fetches.length, 0);
  assert.equal(h.local.radarAccessToken, undefined);
});

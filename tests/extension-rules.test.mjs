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
  URLSearchParams,
  setTimeout,
  clearTimeout,
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
vm.runInContext(
  await readFile(
    new URL("../extension/product-analysis.js", import.meta.url),
    "utf8",
  ),
  sandbox,
);
const A = sandbox.RadarProductAnalysis;
const measured = (rate, method = "HISTORICO", isOwn = false) => ({
  isOwn,
  estimate: { method, windowDays: 30, salesPerDay: { value: rate } },
});

test("demanda usa janela medida; faixas alta, média e baixa são explícitas", () => {
  for (const [rate, expected] of [
    [0, "BAIXA"],
    [0.69, "BAIXA"],
    [0.7, "MEDIA"],
    [3, "ALTA"],
    [10, "EXCELENTE"],
  ])
    assert.equal(A.demand(measured(rate)).level, expected);
  assert.equal(A.demand(measured(5, "OFICIAL", true)).level, "ALTA");
  assert.equal(A.demand(measured(5, "OFICIAL", false)).level, null);
  assert.equal(A.demand(measured(5, "PAGINA")).level, null);
  assert.equal(A.demand(null).level, null);
  const lifetime = measured(5, "VIDA");
  lifetime.estimate.ageDays = { value: 200, source: "API" };
  lifetime.estimate.sold = { exact: true };
  assert.match(A.demand(lifetime).title, /histórica/);
});
test("oportunidade separa alta demanda, margem ruim e dados insuficientes", () => {
  const good = { profit: 20, marginPercent: 25, verdict: "GOOD" };
  assert.equal(A.opportunity(measured(4), good).title, "Boa oportunidade");
  assert.equal(
    A.opportunity(measured(4), { ...good, profit: -1, verdict: "BAD" }).title,
    "Ruim para este custo",
  );
  assert.match(A.opportunity(measured(0.1), good).title, /pouco giro/);
  assert.match(A.opportunity(null, good).title, /demanda a confirmar/);
  assert.notEqual(A.opportunity(measured(4), null).title, "Boa oportunidade");
});
test("card aproveita o acumulado e o preço da página sem inventar faturamento histórico ou demanda diária", () => {
  const obs = {
    id: "MLB1234567890",
    price: 17.88,
    soldLower: 100,
    soldHasPlus: true,
  };
  const card = A.cardMetrics(obs, null);
  assert.equal(card.signal.text, "100+ vendas");
  assert.equal(card.label, "fat. de referência");
  assert.equal(card.amount, "≥ R$\u00a01.788,00");
  assert.match(card.detail, /vendas passadas e o período não são conhecidos/);
  assert.equal(A.demand(null).level, null);
  const changedPrice = A.cardMetrics({ ...obs, price: 20 }, null);
  assert.equal(changedPrice.amount, "≥ R$\u00a02.000,00");
  assert.equal(
    A.cardMetrics({ ...obs, soldHasPlus: false }, null).amount,
    "R$\u00a01.788,00",
  );
});
test("conclusão exige custos para viabilidade e considera perda após Ads", () => {
  const obs = { id: "MLB1234567890", soldLower: 100, soldHasPlus: true };
  const good = {
    profit: 25,
    marginPercent: 25,
    verdict: "GOOD",
    purchaseCost: 40,
    operatingCost: 0,
  };
  assert.equal(A.decision(obs, null, null).title, "Vale simular seu custo");
  assert.equal(
    A.decision(obs, null, good).title,
    "Margem boa · confirme o giro",
  );
  assert.equal(A.decision(obs, measured(4), good).title, "Boa oportunidade");
  assert.equal(A.decision(obs, measured(0.1), good).tone, "warn");
  const afterAds = A.decision(obs, measured(4), good, {
    profitAfterAds: -2,
    marginAfterAdsPercent: -2,
  });
  assert.equal(afterAds.title, "Não compensa neste custo");
  assert.match(afterAds.reason, /2,00.*após Ads/);
  assert.equal(
    A.decision(obs, measured(4), good, {
      profitAfterAds: 12,
      marginAfterAdsPercent: 12,
    }).tone,
    "warn",
  );
});
test("card diferencia zero explícito, dado ausente e avaliações sem quantidade vendida", () => {
  const obs = { id: "MLB1234567890", price: 17.88, reviews: 100 };
  assert.equal(A.cardMetrics(obs, null).kind, "missing");
  assert.equal(
    A.cardMetrics({ ...obs, soldLower: 0 }, null).amount,
    "R$\u00a00,00",
  );
  assert.equal(
    A.cardMetrics({ ...obs, price: null, soldLower: 100 }, null).amount,
    "Preço ausente",
  );
  for (const soldLower of [NaN, Infinity, -1, "100", 1.5])
    assert.equal(A.cardMetrics({ ...obs, soldLower }, null).kind, "missing");
  const best = A.cardMetrics({ ...obs, bestSellerLabel: "Mais vendido" }, null);
  assert.equal(best.signal.text, "Mais vendido");
  assert.equal(best.kind, "missing");
});
test("ritmo de uma referência não preenche outra e projeção diária acompanha o preço atual", () => {
  const obs = {
    id: "MLB1234567890",
    price: 20,
    soldLower: 100,
    soldHasPlus: true,
  };
  const insight = { ...measured(4), id: obs.id, price: 10 };
  assert.equal(A.cardMetrics(obs, insight).amount, "R$\u00a080,00");
  assert.equal(A.cardMetrics(obs, insight).kind, "daily");
  assert.equal(
    A.cardMetrics(obs, { ...insight, id: "MLB9999999999" }).kind,
    "reference",
  );
  assert.equal(
    A.cardMetrics(obs, { ...insight, ...measured(4, "OFICIAL", false) }).kind,
    "reference",
  );
});
test("repasse não esconde frete ausente nem chama saldo antes da compra de lucro", () => {
  const quote = {
    fees: { commissionAmount: 12, fixedFee: 4, shippingCost: null },
    shippingKnown: false,
  };
  assert.equal(A.receipt(quote, 100).value, 84);
  assert.match(A.receipt(quote, 100).label, /antes do frete/);
  quote.shippingKnown = true;
  quote.fees.shippingCost = 0;
  assert.equal(A.receipt(quote, 100).shippingKnown, true);
  quote.fees.shippingCost = 10;
  assert.equal(A.receipt(quote, 100).value, 74);
  assert.equal(A.receipt({}, 100), null);
  const estimated = {
    shippingEstimated: true,
    shippingSource: "MERCADO_LIVRE_PACKAGE_ESTIMATE",
    fees: { commissionAmount: 12, fixedFee: 4, shippingCost: 10 },
  };
  assert.equal(A.receipt(estimated, 100).value, 74);
  assert.match(A.receipt(estimated, 100).label, /estimado/);
  assert.equal(A.receipt(estimated, 100).shippingKnown, false);
  estimated.shippingEstimated = false;
  estimated.shippingSource = "MANUAL_ESTIMATE";
  assert.match(A.receipt(estimated, 100).label, /informado/);
});
test("métricas diferenciam visitas medidas, ofertas parciais e dados ausentes", () => {
  const result = A.marketMetrics({
    insight: measured(4.6),
    analytics: {
      catalog: {
        offersObserved: 5,
        totalReported: 52,
        fullOffersObserved: 2,
        visitsSample: {
          perDay: 76,
          offersMeasured: 3,
          days: 30,
          fullVisitSharePercent: 55,
        },
      },
    },
  });
  assert.equal(result[0].value, "76");
  assert.match(result[0].detail, /não visitantes únicos/);
  assert.equal(result[1].value, "4,6");
  assert.equal(result[2].value, "52");
  assert.match(result[2].detail, /5 ofertas carregadas/);
  assert.equal(result[3].value, "55%");
  const empty = A.marketMetrics({});
  assert.equal(empty[0].value, "Sem acesso");
  assert.equal(empty[1].value, "Sem período");
  assert.equal(empty[3].value, "Sem acesso");
});
test("resposta de produto anterior não sobrescreve anúncio novo nem aplica custo de terceiro", async () => {
  let finishOld, began;
  const started = new Promise((resolve) => {
    began = resolve;
  });
  const ctrl = A.createController({
    changed() {},
    preferences: async () => ({ radarTaxPercent: 0 }),
    send: async (m) => {
      if (m.type === "RADAR_AUTH_STATUS")
        return { authenticated: true, extensionProtocol: 2 };
      if (m.path.startsWith("/api/extension/item?")) {
        if (m.path.includes("MLBU11111111")) {
          began();
          return new Promise((resolve) => {
            finishOld = resolve;
          });
        }
        return {
          ok: true,
          body: {
            item: { id: "MLB22222222", isOwn: false },
            savedCost: { supplierPrice: 999, discountPercent: 0 },
          },
        };
      }
      return {
        ok: true,
        body: {
          items: [],
          competitors: [],
          fees: {
            commissionAmount: 1,
            commissionPercent: 12,
            fixedFee: 4,
            shippingCost: null,
          },
        },
      };
    },
  });
  const first = ctrl.load({
    id: "MLBU11111111",
    title: "Produto A",
    price: 10,
  });
  await started;
  await ctrl.load({ id: "MLBU22222222", title: "Produto B", price: 20 });
  finishOld({
    ok: true,
    body: {
      item: { id: "MLB11111111", isOwn: true },
      savedCost: { supplierPrice: 5, discountPercent: 0 },
    },
  });
  await first;
  assert.equal(ctrl.state.obs.id, "MLBU22222222");
  assert.equal(ctrl.state.item.id, "MLB22222222");
  assert.equal(ctrl.state.fields.cost, "");
  ctrl.clear();
});

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
    {
      id: "a".repeat(32),
      tab: { id: 1 },
      url: "https://www.mercadolivre.com.br/fio/up/MLBU5074600649",
    },
  );
  assert.equal(h.opened.length, 1);
  assert.equal((await result).ok, true);
  assert.equal(h.sessionWrites[0].radarPanelIntent.tabId, 1);
  assert.equal(h.sessionWrites[0].radarPanelIntent.tab, "summary");
  h.sessionWrites.length = 0;
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
test("changing server cannot forward current or legacy Radar tokens to another origin", async () => {
  for (const origin of ["https://radar.optarys.com.br", undefined]) {
    const h = await backgroundHarness();
    h.sync.radarApiBase = "http://localhost:3000";
    Object.assign(h.local, {
      radarAuthOrigin: origin,
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
  }
});

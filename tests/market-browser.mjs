/** Component regression harness: real React + product components + app CSS.
 * Only Next's Link is replaced by an anchor; auth is tested by http-smoke.mjs.
 * API fixtures below are synthetic, never customer/competitor market claims.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import ts from "typescript";
import { chromium } from "playwright";

const root = resolve(new URL("../", import.meta.url).pathname);
const modules = new Map();
function bundleFile(file) {
  if (modules.has(file)) return file;
  modules.set(file, "");
  let source = readFileSync(file, "utf8");
  if (/\.tsx?$/.test(file))
    source = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
  const req = createRequire(file);
  source = source.replace(/require\(["']([^"']+)["']\)/g, (_all, name) => {
    if (name === "next/link") return 'require("next-link-test")';
    let next = name.startsWith("@/")
      ? resolve(root, name.slice(2))
      : req.resolve(name);
    if (!existsSync(next)) next += existsSync(next + ".tsx") ? ".tsx" : ".ts";
    return `require(${JSON.stringify(bundleFile(next))})`;
  });
  modules.set(file, source);
  return file;
}
const require = createRequire(import.meta.url);
const react = bundleFile(require.resolve("react"));
const dom = bundleFile(require.resolve("react-dom/client"));
const market = bundleFile(resolve(root, "components/market-intelligence.tsx"));
const dashboard = bundleFile(
  resolve(root, "components/executive-dashboard.tsx"),
);
const opportunities = bundleFile(
  resolve(root, "components/opportunity-radar.tsx"),
);
const competitors = bundleFile(
  resolve(root, "components/competitor-radar.tsx"),
);
const kits = bundleFile(resolve(root, "components/kit-optimizer.tsx"));
modules.set(
  "next-link-test",
  `module.exports = function Link(props) {return require(${JSON.stringify(react)}).createElement("a",props,props.children);};`,
);
const js = `(() => {const process={env:{NODE_ENV:"production"}}, modules={${[...modules].map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){\n${code}\n}`).join(",\n")}}, cache={}; function require(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};modules[id](m,m.exports,require);return m.exports;}
const React=require(${JSON.stringify(react)}), Client=require(${JSON.stringify(dom)});const Component=location.pathname==="/kits"?require(${JSON.stringify(kits)}).KitOptimizer:location.pathname==="/competitors"?require(${JSON.stringify(competitors)}).CompetitorRadar:location.pathname==="/dashboard"?require(${JSON.stringify(dashboard)}).ExecutiveDashboard:location.pathname==="/opportunities"?require(${JSON.stringify(opportunities)}).OpportunityRadar:require(${JSON.stringify(market)}).MarketIntelligence;
Client.createRoot(document.getElementById("app")).render(React.createElement(Component));})();`;
const server = createServer((request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  if (path === "/test-client.js")
    return response
      .writeHead(200, { "content-type": "text/javascript" })
      .end(js);
  if (path.startsWith("/app/") || path.startsWith("/fonts/")) {
    const file = resolve(
      root,
      (path.startsWith("/fonts/") ? "public" : ".") + path,
    );
    if (!file.startsWith(root + "/") || !existsSync(file))
      return response.writeHead(404).end();
    return response
      .writeHead(200, {
        "content-type": extname(file) === ".css" ? "text/css" : "font/woff2",
      })
      .end(readFileSync(file));
  }
  response
    .writeHead(200, { "content-type": "text/html" })
    .end(
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/globals.css"><main class="content routed-content"><div id="app"></div></main><script src="/test-client.js"></script></html>',
    );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const artifacts = process.env.RADAR_QA_ARTIFACTS;
if (artifacts) await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.RADAR_CHROMIUM_PATH
    ? { executablePath: process.env.RADAR_CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const blank = { value: null, low: null, high: null };
const stamp = new Date().toISOString();
function product(id, sold, extra = {}) {
  return {
    id: `MLB${id}`,
    title: `Produto de teste ${id}`,
    price: 100,
    thumbnail: null,
    permalink: `https://www.mercadolivre.com.br/MLB-${id}`,
    rating: 4.8,
    reviews: 40,
    soldLabel: `+${sold} vendidos`,
    freeShipping: true,
    fulfillment: false,
    isOwn: false,
    firstSeenAt: stamp,
    lastSeenAt: stamp,
    score: null,
    demand: null,
    estimate: {
      method: "PAGINA",
      confidence: 0,
      salesPerDay: blank,
      revenuePerDay: blank,
      visitsPerDay: blank,
      conversion: { value: 0.025, source: "PADRAO" },
      sold: { lower: sold, upper: null, exact: false },
      ageDays: { value: null, source: null },
      windowDays: null,
      observations: 1,
      basis: ["Contador público sem período."],
    },
    ...extra,
  };
}
const items = [
  product("1234567890", 1000, {
    title: "Alicate kit",
    price: 115.19,
    fulfillment: true,
  }),
  product("1234567891", 100, { title: "Prensa manual", price: 272.65 }),
  product("1234567892", 5000, { title: "Kit excelente", isOwn: true }),
  product("1234567893", 25, { title: "Produto novo" }),
  product("1234567894", null, { title: "Sem contador" }),
  product("1234567895", 9000, { title: "Ritmo recente zero" }),
];
items[5].estimate = {
  ...items[5].estimate,
  method: "HISTORICO",
  windowDays: 30,
  salesPerDay: { value: 0, low: 0, high: 0 },
};
let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log("PASS market-browser " + name);
}
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/market/items?**", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q");
    if (q === "antigo") await new Promise((r) => setTimeout(r, 850));
    const result =
      q === "antigo"
        ? [product("9999999999", 1000, { title: "Resposta antiga" })]
        : q === "novo"
          ? [items[3]]
          : items;
    await route.fulfill({
      json: {
        items: result,
        summary: { marketItems: 5, ownItems: 1, snapshots: 6, withHistory: 1 },
      },
    });
  });
  await page.route("**/api/market/items/MLB*", (route) =>
    route.fulfill({
      json: {
        insight: items.find((i) => route.request().url().endsWith(i.id)),
        series: [
          {
            at: stamp,
            source: "PAGE",
            price: 272.65,
            soldLower: 100,
            soldExact: null,
            reviews: 40,
            visitsTotal: null,
          },
        ],
      },
    }),
  );
  await page.goto(base);
  await page.locator(".market-product").first().waitFor();
  await check(
    "public counters produce distinct readings and visible reference revenue",
    async () => {
      assert.equal(await page.locator(".market-product").count(), 6);
      assert.match(
        await page.locator('[data-market-id="MLB1234567890"]').innerText(),
        /Bom potencial[\s\S]*Alta[\s\S]*115,1 mil/,
      );
      assert.match(
        await page.locator('[data-market-id="MLB1234567891"]').innerText(),
        /Potencial moderado[\s\S]*Média[\s\S]*27,2 mil/,
      );
      assert.match(
        await page.locator('[data-market-id="MLB1234567895"]').innerText(),
        /Pouco giro[\s\S]*0 un.\/dia/,
      );
      assert.equal(
        await page
          .locator('[data-market-id="MLB1234567894"] .market-reading b')
          .last()
          .innerText(),
        "—",
      );
      assert.equal(
        await page.getByText("Itens monitorados", { exact: true }).count(),
        0,
      );
      if (artifacts)
        await page.screenshot({
          path: artifacts + "/market-cards.png",
          fullPage: true,
        });
    },
  );
  await check(
    "filters, price ordering and table preserve demand and reference columns",
    async () => {
      await page
        .getByLabel("Filtrar por potencial", { exact: true })
        .selectOption("favorable");
      assert.equal(await page.locator(".market-product").count(), 2);
      await page.getByRole("button", { name: /Limpar filtros/ }).click();
      await page.getByLabel("Ordenar por").selectOption("priceDesc");
      assert.equal(
        await page
          .locator(".market-product")
          .first()
          .getAttribute("data-market-id"),
        "MLB1234567891",
      );
      await page.getByRole("button", { name: "Tabela", exact: true }).click();
      assert.equal(
        await page
          .getByRole("columnheader", { name: "Demanda", exact: true })
          .count(),
        1,
      );
      assert.equal(
        await page
          .getByRole("columnheader", {
            name: "Receita de referência",
            exact: true,
          })
          .count(),
        1,
      );
      if (artifacts)
        await page.screenshot({
          path: artifacts + "/market-table.png",
          fullPage: true,
        });
      await page.getByRole("button", { name: "Cards", exact: true }).click();
    },
  );
  await check(
    "side-by-side comparison is capped at four and remains available after filtering",
    async () => {
      for (const i of items.slice(0, 4))
        await page
          .getByRole("checkbox", { name: `Comparar ${i.title}`, exact: true })
          .check();
      assert.equal(
        await page
          .getByRole("checkbox", { name: "Comparar Sem contador", exact: true })
          .isDisabled(),
        true,
      );
      await page.getByRole("button", { name: "Comparar lado a lado" }).click();
      assert.equal(
        await page.locator(".market-comparison-table thead th").count(),
        5,
      );
      await page.getByRole("button", { name: "Full", exact: true }).click();
      assert.equal(await page.locator(".market-product").count(), 1);
      assert.match(
        await page.locator(".market-comparison-table").innerText(),
        /Prensa manual[\s\S]*27,2 mil/,
      );
      if (artifacts)
        await page.screenshot({
          path: artifacts + "/market-comparison.png",
          fullPage: true,
        });
      await page.getByRole("button", { name: /Limpar filtros/ }).click();
      await page.getByRole("button", { name: "Limpar", exact: true }).click();
    },
  );
  await check(
    "detail labels a lower bound as a minimum and does not invent conversions",
    async () => {
      await page
        .locator('[data-market-id="MLB1234567891"]')
        .getByRole("button", { name: "Ver análise →" })
        .click();
      await page.locator(".market-facts").waitFor();
      const detail = await page
        .getByRole("region", { name: "Análise do produto selecionado" })
        .innerText();
      assert.match(detail, /100\+/);
      assert.doesNotMatch(
        detail,
        /100 a —|Conversão usada|Faturamento acumulado/,
      );
      await page.getByRole("button", { name: "Fechar análise" }).click();
    },
  );
  await check("cards and comparison stay within mobile viewport", async () => {
    for (const width of [390, 680, 1366]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    await page.setViewportSize({ width: 390, height: 900 });
    if (artifacts)
      await page.screenshot({
        path: artifacts + "/market-mobile.png",
        fullPage: true,
      });
  });
  await check(
    "a slower old query cannot overwrite a later search",
    async () => {
      await page.getByLabel("Buscar nos anúncios salvos").fill("antigo");
      await page.waitForRequest((r) => r.url().includes("q=antigo"));
      await page.getByLabel("Buscar nos anúncios salvos").fill("novo");
      await page
        .locator(".market-product h3")
        .filter({ hasText: "Produto novo" })
        .waitFor();
      await page.waitForTimeout(900);
      assert.equal(await page.locator(".market-product").count(), 1);
      assert.equal(await page.getByText("Resposta antiga").count(), 0);
    },
  );
  await check(
    "seller dashboard offers discovery without displaying unknown capital as zero",
    async () => {
      await page.route("**/api/decisions?**", (route) =>
        route.fulfill({
          json: {
            connected: true,
            configured: true,
            workspaceName: "Conta de teste",
            historyComplete: false,
            reportComplete: false,
            days: 30,
            summary: null,
            decisions: [],
          },
        }),
      );
      await page.goto(base + "/dashboard");
      await page.locator(".radar-discover").waitFor();
      assert.equal(
        await page.locator(".radar-discover form").getAttribute("action"),
        "/oportunidades",
      );
      await page
        .getByText("Capital conhecido em estoque", { exact: true })
        .waitFor();
      assert.match(
        await page.locator(".clean-kpi-card").last().innerText(),
        /A apurar/,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    },
  );
  await check(
    "discovery uses the same demand and potential, keeps catalog source and renders on mobile",
    async () => {
      await page.route("**/api/ml/opportunity-trends", (route) =>
        route.fulfill({ json: { trends: [] } }),
      );
      await page.route("**/api/monitoring/watchlist", (route) =>
        route.fulfill({ json: { items: [] } }),
      );
      const opportunity = (item, index) => ({
        ...item,
        categoryId: "MLB123",
        sellerId: "test",
        listingTypeId: "gold_special",
        logisticType: item.fulfillment ? "fulfillment" : "drop_off",
        shippingMode: "me2",
        catalogProductId: "MLB123456",
        userProductId: null,
        searchPosition: index + 1,
        similarityPercent: 100,
        soldQuantity: item.estimate.sold.lower,
        visits: null,
        dateCreated: null,
        gapToMedian: null,
        score: 50,
        demandLabel: index === 0 ? "EXCELENTE" : "BAIXA",
        scorePartial: false,
        rhythm: index === 0 ? null : "MEDIDO",
        measurementDays: index === 0 ? null : 30,
        evidence: "LOW",
        salesPerDay: index === 0 ? null : 0,
        salesPerMonth: index === 0 ? null : 0,
        revenuePerDay: index === 0 ? null : 0,
        revenuePerMonth: index === 0 ? null : 0,
        visitsPerDay: null,
        ageDays: null,
        bestSellerPosition: null,
        scoreComponents: {
          demand: 0,
          velocity: 0,
          relevance: 100,
          price: 50,
          logistics: 50,
          evidence: 10,
        },
        sources: {
          price: "CATALOG_BUY_BOX_WINNER",
          soldQuantity: index === 0 ? "CATALOG_PRODUCT" : "ITEMS_BULK",
          visits: "UNAVAILABLE",
        },
      });
      await page.route("**/api/ml/opportunity-search", (route) =>
        route.fulfill({
          json: {
            generatedAt: stamp,
            query: "Kit de teste",
            category: { id: "MLB123", name: "Teste", source: "PREDICTED" },
            summary: {
              median: 100,
              p25: 90,
              p75: 120,
              uniqueSellers: 2,
              comparableCount: 2,
              competitionLevel: "BAIXA",
              freeShippingPercent: 100,
              fullPercent: 50,
              flexPercent: 0,
              medianEstimatedSalesPerMonth: null,
              medianEstimatedRevenuePerMonth: null,
            },
            opportunities: [opportunity(items[2], 0), opportunity(items[5], 1)],
          },
        }),
      );
      await page.goto(base + "/opportunities?q=kit");
      await page.locator(".opp-row").first().waitFor();
      assert.match(
        await page.locator(".opp-row").first().innerText(),
        /Excelente.*demanda histórica[\s\S]*Receita de referência · catálogo[\s\S]*Potencial forte/,
      );
      assert.match(
        await page.locator(".opp-row").last().innerText(),
        /Baixa.*demanda medida[\s\S]*Pouco giro/,
      );
      for (const width of [390, 1366]) {
        await page.setViewportSize({ width, height: 1000 });
        if (artifacts)
          await page.screenshot({
            path: artifacts + `/opportunity-${width}.png`,
            fullPage: true,
          });
        const overflow = await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 12)
            .map((el) => ({
              tag: el.tagName,
              cls: el.className,
              width: el.getBoundingClientRect().width,
              right: el.getBoundingClientRect().right,
            })),
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          JSON.stringify(overflow),
        );
      }
    },
  );
  const competitionItems = [2, 4, 6, 8, 10].map((quantity, index) => ({
    id: "MLB777000" + String(index).padStart(3, "0"),
    title: `Kit ${quantity} Canetas Fantasminha Montovani Azul`,
    price: quantity * (10 - index),
    unitPrice: 10 - index,
    quantity,
    quantitySource: "ATTRIBUTE",
    brand: "Montovani",
    model: "Fantasminha",
    color: "Azul",
    categoryId: "MLB1234",
    catalogProductId: null,
    thumbnail: null,
    permalink: null,
    sellerId: "seller-" + index,
    sellerName: null,
    reputation: null,
    listingType: "gold_special",
    freeShipping: true,
    fulfillment: index % 2 === 0,
    sold: index === 0 ? 0 : null,
    soldIsLowerBound: false,
    isOwn: false,
    source: "ML_API",
    observedAt: stamp,
  }));
  let savedDrafts = [],
    searches = [];
  await page.route("**/api/intelligence/drafts**", (route) => {
    const request = route.request();
    if (request.method() === "POST")
      savedDrafts.push({
        ...request.postDataJSON(),
        id: "draft-research",
        updatedAt: stamp,
      });
    if (request.method() === "DELETE") savedDrafts = [];
    return route.fulfill({
      json:
        request.method() === "GET"
          ? { drafts: savedDrafts }
          : { ok: true, id: "draft-research" },
    });
  });
  await page.route("**/api/intelligence/competitors?**", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q");
    searches.push(q);
    if (q === "antigo") await new Promise((r) => setTimeout(r, 650));
    await route.fulfill({
      json: {
        query: q,
        referenceId: competitionItems[0].id,
        items:
          q === "vazio"
            ? []
            : q === "antigo"
              ? [
                  {
                    ...competitionItems[0],
                    title: "Resposta antiga concorrente",
                  },
                ]
              : competitionItems,
        notices:
          q === "restrito"
            ? [
                {
                  code: "FORBIDDEN",
                  message: "API restrita. Compare as leituras da extensão.",
                },
              ]
            : [],
        scope: "Amostra sintética de regressão.",
        paging: { hasMore: false, nextOffset: null, total: 5 },
      },
    });
  });
  await page.route("**/api/monitoring/watchlist", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await check(
    "competitor search normalizes kits, preserves reviewed selection and saves inputs as draft",
    async () => {
      await page.goto(base + "/competitors");
      await page
        .getByLabel("Produto, SKU cadastrado, código MLB ou link")
        .fill("Caneta");
      await page
        .getByRole("button", { name: "Pesquisar", exact: true })
        .click();
      await page.locator(".intel-offer").first().waitFor();
      assert.equal(await page.locator(".intel-offer").count(), 5);
      assert.match(
        await page.locator(".intel-offer").first().innerText(),
        /R\$\s*6,00[\s\S]*10 un/,
      );
      for (const row of competitionItems.slice(0, 4))
        await page.getByLabel("Comparar " + row.id, { exact: true }).check();
      assert.equal(
        await page
          .getByLabel("Comparar " + competitionItems[4].id, { exact: true })
          .isDisabled(),
        true,
      );
      await page
        .locator(".intel-offer")
        .filter({
          has: page.getByLabel("Comparar " + competitionItems[1].id, {
            exact: true,
          }),
        })
        .locator("summary")
        .click();
      await page
        .getByLabel("Correspondência " + competitionItems[1].id, {
          exact: true,
        })
        .selectOption("EQUIVALENT");
      await page
        .getByLabel("Filtrar por correspondência", { exact: true })
        .selectOption("EQUIVALENT");
      assert.equal(await page.locator(".intel-offer").count(), 1);
      assert.equal(
        await page.locator(".intel-compare-grid article").count(),
        4,
      );
      await page
        .getByRole("button", { name: "Salvar rascunho", exact: true })
        .click();
      await page.getByText(/Rascunho salvo nesta operação/).waitFor();
      assert.equal(savedDrafts[0].payload.selectedIds.length, 4);
      assert.equal(savedDrafts[0].payload.overrides[0].level, "EQUIVALENT");
      await page
        .getByLabel("Filtrar por correspondência", { exact: true })
        .selectOption("ALL");
    },
  );
  await check(
    "competitor UI handles empty and restricted data and remains readable on desktop and mobile",
    async () => {
      for (const width of [1366, 680, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        if (artifacts)
          await page.screenshot({
            path: artifacts + `/competitors-${width}.png`,
            fullPage: true,
          });
      }
      for (const q of ["vazio", "restrito"]) {
        await page
          .getByLabel("Produto, SKU cadastrado, código MLB ou link")
          .fill(q);
        await page
          .getByRole("button", { name: "Pesquisar", exact: true })
          .click();
        if (q === "vazio")
          await page
            .getByRole("heading", {
              name: "Nenhuma oferta disponível nesta amostra",
            })
            .waitFor();
        else
          await page
            .getByText("API restrita. Compare as leituras da extensão.")
            .waitFor();
      }
    },
  );
  await check("competitor search discards an outdated response", async () => {
    await page
      .getByLabel("Produto, SKU cadastrado, código MLB ou link")
      .fill("antigo");
    await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
    // A restored draft can launch another query while the older request is pending.
    await page.locator(".intel-drafts summary").click();
    await page.locator(".intel-draft-list button").first().click();
    await page.locator(".intel-offer").first().waitFor();
    await page.waitForTimeout(750);
    assert.equal(
      await page.getByText("Resposta antiga concorrente").count(),
      0,
    );
    assert.ok(searches.includes("antigo"));
  });
  let kitAccount = null,
    wrongQuoteOwner = false,
    quoteFailure = false;
  const quoteRequests = [];
  await page.route("**/api/intelligence/kits/context", (route) =>
    route.fulfill({
      json: {
        workspaceId: "kit-workspace",
        accountId: kitAccount,
        accountName: kitAccount ? "Loja teste" : null,
        defaults: {
          taxPercent: 4,
          operatingCost: 0.8,
          targetMarginPercent: 20,
          targetRoiPercent: 30,
        },
      },
    }),
  );
  await page.route("**/api/intelligence/kits/quote", async (route) => {
    const c = route.request().postDataJSON();
    quoteRequests.push(c);
    if (quoteFailure)
      return route.fulfill({
        status: 503,
        json: { error: "Cotação indisponível. Tente novamente." },
      });
    const rate = c.listingType === "PREMIUM" ? 16.5 : 12;
    return route.fulfill({
      json: {
        context: c,
        accountId: wrongQuoteOwner ? "another-account" : kitAccount,
        accountName: "Loja teste",
        quotedAt: new Date().toISOString(),
        fee: {
          commissionPercent: rate,
          fixedFee: 4,
          saleFeeAmount:
            Math.round(((c.salePrice * rate) / 100 + 4) * 100) / 100,
        },
        shipping: c.shippingPackage
          ? { shippingCost: 6.85, discountRate: 0.5 }
          : null,
        notices: [],
      },
    });
  });
  const card = (quantity) => page.locator(`[data-kit-quantity="${quantity}"]`);
  await check(
    "kit simulator starts clean, recalculates costs and saves the selected composition",
    async () => {
      await page.goto(base + "/kits");
      await page
        .getByText("Informe o produto e o custo de compra", { exact: true })
        .waitFor();
      assert.equal(await page.locator(".kit-card").count(), 0);
      await page
        .getByRole("button", { name: "Carregar exemplo Montovani" })
        .click();
      await page
        .getByLabel("Preço por unidade para simular (R$)", { exact: true })
        .fill("10");
      await page
        .getByLabel("Embalagem por kit (R$)", { exact: true })
        .fill("1");
      await page
        .getByLabel("Frete estimado do vendedor (R$)", { exact: true })
        .fill("6,85");
      await page.locator(".kit-cost-settings > summary").click();
      await page
        .getByLabel("Consultar automaticamente na minha conta")
        .uncheck();
      await page
        .getByLabel("Comissão manual estimada (%)", { exact: true })
        .fill("12");
      await page
        .getByLabel("Tarifa fixa manual estimada (R$)", { exact: true })
        .fill("4");
      await page
        .getByLabel("Tarifa fixa manual estimada (R$)", { exact: true })
        .blur();
      assert.match(
        await card(8).locator(".kit-financial").innerText(),
        /18,55/,
      );
      assert.match(await card(2).innerText(), /Não compensa neste preço/);
      await page
        .getByLabel("Custo de compra por unidade (R$)", { exact: true })
        .fill("8");
      assert.match(await card(8).innerText(), /Não compensa neste preço/);
      await page
        .getByLabel("Custo de compra por unidade (R$)", { exact: true })
        .fill("4,50");
      await card(4)
        .getByRole("button", { name: "Ver composição e custos" })
        .click();
      await page
        .getByLabel("Composição do kit")
        .selectOption({ label: "2 Azul + 2 Preta" });
      await page
        .getByRole("button", { name: "Salvar rascunho", exact: true })
        .click();
      await page.getByText(/Rascunho salvo nesta operação/).waitFor();
      const saved = savedDrafts.find((d) => d.kind === "KIT");
      assert.ok(saved.payload.selectedKitId.includes("color0=2"));
      assert.equal(saved.payload.scenario.unitCost, 4.5);
      assert.equal(saved.payload.snapshot, undefined);
      await page.getByLabel("Imposto (%)", { exact: true }).fill("");
      assert.match(
        await card(8).locator(".kit-financial").innerText(),
        /A confirmar/,
      );
      await page.getByLabel("Imposto (%)", { exact: true }).fill("4");
      await page.getByLabel("Imposto (%)", { exact: true }).blur();
      await page.locator(".kit-cost-settings > summary").click();
      for (const width of [1366, 680, 390]) {
        await page.setViewportSize({ width, height: 960 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        if (artifacts)
          await page.screenshot({
            path: artifacts + `/kits-${width}.png`,
            fullPage: true,
          });
      }
    },
  );
  await check(
    "kit simulator rejects insufficient and fractional stock and distinguishes an unknown stock",
    async () => {
      for (const label of ["Azul", "Preta", "Vermelha", "Rosa"])
        await page
          .getByLabel(`Estoque de ${label} (un.)`, { exact: true })
          .fill("0");
      await page
        .getByText("Nenhuma composição disponível neste estoque", {
          exact: true,
        })
        .waitFor();
      await page
        .getByLabel("Estoque de Azul (un.)", { exact: true })
        .fill("1,5");
      assert.equal(await page.locator(".kit-card").count(), 0);
      await page.getByLabel("Estoque de Azul (un.)", { exact: true }).fill("");
      await page.locator(".kit-card").first().waitFor();
      assert.ok((await card(8).innerText()).includes("A confirmar"));
    },
  );
  await check(
    "kit automatic quote uses account, package and listing type without double subtracting shipping discounts",
    async () => {
      kitAccount = "kit-account-a";
      await page.goto(base + "/kits");
      await page
        .getByText("Cotações na conta Loja teste.", { exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Carregar exemplo Montovani" })
        .click();
      await page
        .getByLabel("Preço por unidade para simular (R$)", { exact: true })
        .fill("10");
      await page
        .getByLabel("Embalagem por kit (R$)", { exact: true })
        .fill("1");
      await page.locator(".kit-cost-settings > summary").click();
      await page.getByLabel("Categoria MLB", { exact: true }).fill("MLB1234");
      for (const [label, value] of [
        ["Peso de uma unidade (g)", "10"],
        ["Peso da embalagem (g)", "20"],
        ["Altura do pacote (cm)", "5"],
        ["Largura do pacote (cm)", "10"],
        ["Comprimento do pacote (cm)", "20"],
      ])
        await page.getByLabel(label, { exact: true }).fill(value);
      await page
        .getByLabel("Comprimento do pacote (cm)", { exact: true })
        .blur();
      await page.waitForFunction(() =>
        document
          .querySelector('[data-kit-quantity="8"] .kit-financial')
          .textContent.includes("18,55"),
      );
      assert.ok(
        quoteRequests.some(
          (c) => c.quantity === 8 && c.shippingPackage?.weightGrams === 100,
        ),
      );
      await page.getByLabel("Modalidade do kit").selectOption("PREMIUM");
      await page.waitForFunction(() =>
        document
          .querySelector('[data-kit-quantity="8"] .kit-financial')
          .textContent.includes("14,95"),
      );
      assert.ok(
        quoteRequests.some(
          (c) => c.quantity === 8 && c.listingType === "PREMIUM",
        ),
      );
    },
  );
  await check(
    "kit quote from a different account is rejected and network failures remain retryable",
    async () => {
      wrongQuoteOwner = true;
      await page
        .getByRole("button", { name: "Atualizar cotações", exact: true })
        .click();
      await page.waitForTimeout(900);
      assert.match(
        await card(8).locator(".kit-financial").innerText(),
        /A confirmar/,
      );
      wrongQuoteOwner = false;
      quoteFailure = true;
      await page
        .getByRole("button", { name: "Atualizar cotações", exact: true })
        .click();
      await page
        .getByText("Cotação indisponível. Tente novamente.", { exact: true })
        .waitFor();
      quoteFailure = false;
      await page
        .getByRole("button", { name: "Atualizar cotações", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector('[data-kit-quantity="8"] .kit-financial')
          .textContent.includes("14,95"),
      );
    },
  );
  await check(
    "changing the connected account removes the preceding private kit scenario",
    async () => {
      await page
        .getByLabel("Custo de compra por unidade (R$)", { exact: true })
        .focus();
      kitAccount = "kit-account-b";
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page
        .getByText(
          "A conta mudou. Os custos e cotações anteriores foram retirados desta simulação.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await page
          .getByLabel("Custo de compra por unidade (R$)", { exact: true })
          .inputValue(),
        "",
      );
      assert.equal(await page.locator(".kit-card").count(), 0);
    },
  );
  assert.deepEqual(errors, []);
  console.log(`MARKET_BROWSER_OK ${checks} checks; no browser errors`);
} finally {
  await browser.close();
  server.close();
}

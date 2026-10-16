import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";
const root = new URL("../", import.meta.url),
  extension = new URL("extension/", root);
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(request.url.split("?")[0]);
  if (!/^\/[\w/.-]+$/.test(path) || path.includes("..")) {
    response.writeHead(400).end();
    return;
  }
  try {
    const file = new URL(path.slice(1), extension);
    const content = await readFile(file);
    response.setHeader(
      "content-type",
      file.pathname.endsWith(".css")
        ? "text/css"
        : file.pathname.endsWith(".js")
          ? "text/javascript"
          : file.pathname.endsWith(".png")
            ? "image/png"
            : "text/html",
    );
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const artifacts = process.env.RADAR_QA_ARTIFACTS;
if (artifacts) await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.RADAR_CHROMIUM_PATH
    ? { executablePath: process.env.RADAR_CHROMIUM_PATH }
    : {}),
  args: [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-dev-shm-usage",
  ],
});
const errors = [];
let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log("PASS browser " + name);
}
try {
  const host = await browser.newPage({
    viewport: { width: 1366, height: 900 },
  });
  const fixture = await readFile(
    new URL("tests/fixtures/extension-product.html", root),
    "utf8",
  );
  await host.route("https://www.mercadolivre.com.br/**", (route) =>
    route.fulfill({ body: fixture, contentType: "text/html" }),
  );
  host.on("pageerror", (error) => errors.push(error.message));
  const contentStub = () => {
    window.__messages = [];
    window.__hostQa = {
      auth: true,
      own: false,
      rate: null,
      prefs: {},
      delay: 0,
    };
    window.chrome = {
      storage: {
        sync: { get: async () => window.__hostQa.prefs, set: async () => {} },
        onChanged: {
          addListener(fn) {
            window.__hostQa.change = fn;
          },
        },
      },
      runtime: {
        onMessage: {
          addListener(fn) {
            window.__contentListener = fn;
          },
        },
        sendMessage: async (message) => {
          window.__messages.push(message);
          const qa = window.__hostQa;
          if (message.type === "RADAR_AUTH_STATUS")
            return { authenticated: qa.auth, extensionProtocol: 2 };
          if (message.type === "RADAR_FETCH") {
            if (!qa.auth) return { ok: false, status: 401 };
            const ok = (body) => ({ ok: true, status: 200, body });
            if (message.path === "/api/extension/watchlist")
              return ok({ note: "Salvo. Atualiza por novas leituras." });
            if (message.path === "/api/extension/observations") {
              const result = {
                items: message.body.items.map((item) => {
                  const rate = Object.hasOwn(qa.rates || {}, item.id)
                    ? qa.rates[item.id]
                    : qa.rate;
                  return {
                    id: item.id,
                    price: item.price,
                    isOwn: qa.own,
                    estimate: {
                      method:
                        rate == null
                          ? "PAGINA"
                          : qa.own
                            ? "OFICIAL"
                            : "HISTORICO",
                      windowDays: rate == null ? null : 30,
                      salesPerDay: { value: rate },
                      revenuePerDay: {
                        value: rate == null ? null : rate * item.price,
                      },
                      sold: { exact: false },
                    },
                  };
                }),
              };
              if (qa.holdObservations)
                await new Promise((resolve) => {
                  qa.releaseObservations = resolve;
                });
              return ok(result);
            }
            if (message.path.startsWith("/api/extension/item?"))
              return ok({
                item: qa.own
                  ? {
                      id: "MLB999000001",
                      isOwn: true,
                      listingTypeId: "gold_special",
                      logisticType: "drop_off",
                      categoryId: "MLB1234",
                    }
                  : null,
                savedCost: qa.own
                  ? { supplierPrice: 5, discountPercent: 0, source: "LISTING" }
                  : null,
              });
            if (message.path.startsWith("/api/extension/market?"))
              return ok({
                competitors: [20, 30, 40].map((price, i) => ({
                  id: "MLBU700000000" + i,
                  title: "Fio encerado preto 165m 2mm",
                  price,
                })),
              });
            if (message.path === "/api/extension/profitability") {
              if (qa.delay)
                await new Promise((resolve) => setTimeout(resolve, qa.delay));
              const p = message.body,
                rate = p.listingType === "PREMIUM" ? 16.5 : 12;
              const round = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
              const shippingKnown =
                qa.own && p.listingType === "CLASSIC" && p.shippingCost == null;
              const shipping = p.shippingCost ?? (shippingKnown ? 0 : null);
              const fees = {
                commissionPercent: rate,
                commissionAmount: round((p.salePrice * rate) / 100),
                fixedFee: 4,
                shippingCost: shipping,
                taxPercent: p.taxPercent ?? null,
              };
              let result = null;
              if (!p.quoteOnly && shipping != null && p.taxPercent != null) {
                const profit = round(
                  p.salePrice -
                    fees.commissionAmount -
                    4 -
                    shipping -
                    p.supplierPrice -
                    round((p.salePrice * p.taxPercent) / 100) -
                    p.operatingCost,
                );
                const marginPercent = (profit / p.salePrice) * 100;
                result = {
                  profit,
                  marginPercent,
                  roiPercent:
                    (profit / (p.supplierPrice + p.operatingCost)) * 100,
                  verdict:
                    profit <= 0 || marginPercent < 10
                      ? "BAD"
                      : marginPercent < 20
                        ? "TIGHT"
                        : "GOOD",
                };
              }
              return ok({
                result,
                fees,
                shippingKnown,
                feeSource: "MERCADO_LIVRE_API",
                categorySource: qa.own ? "API" : "PREDICTED",
              });
            }
            throw new Error("Unexpected content test path: " + message.path);
          }
          return { ok: true };
        },
      },
    };
  };
  await host.addInitScript(contentStub);
  await host.goto("https://www.mercadolivre.com.br/fio/up/MLBU5074600649");
  const geometry = () =>
    host.evaluate(() =>
      [
        ...document.querySelectorAll(
          "header,main,.gallery,.ui-pdp-container--column-right,#native-buy",
        ),
      ].map((el) => ({
        rect: JSON.stringify(el.getBoundingClientRect().toJSON()),
        style: el.getAttribute("style"),
        text: el.textContent,
      })),
    );
  const before = await geometry();
  const overflow = await host.evaluate(
    () => document.documentElement.scrollWidth,
  );
  await host.addScriptTag({
    path: new URL("selectors.js", extension).pathname,
  });
  await host.addScriptTag({
    path: new URL("panel-model.js", extension).pathname,
  });
  await host.addScriptTag({
    path: new URL("product-analysis.js", extension).pathname,
  });
  await host.addScriptTag({ path: new URL("content.js", extension).pathname });
  await host.locator('[data-radar-owned="product"]').waitFor();
  await check(
    "host layout, price, recommendation IDs and native purchase button",
    async () => {
      const after = await geometry();
      for (let i = 0; i < after.length; i++) {
        assert.equal(after[i].style, before[i].style);
        assert.equal(after[i].text, before[i].text);
        const a = JSON.parse(after[i].rect),
          b = JSON.parse(before[i].rect);
        assert.equal(a.x, b.x);
        assert.equal(a.width, b.width);
      }
      assert.equal(
        await host.evaluate(() => document.documentElement.scrollWidth),
        overflow,
      );
      const observation = await host.evaluate(() =>
        RadarSelectors.pageObservation(),
      );
      assert.equal(observation.id, "MLBU5074600649");
      assert.equal(observation.price, 17.9);
      assert.equal(observation.listingTypeHint, null);
      assert.equal(observation.categoryId, null);
      assert.equal(observation.soldLower, 25);
      assert.equal(await host.locator("[data-radar-owned]").count(), 3);
      await host.locator("#native-buy").click();
      assert.equal(
        await host.locator("#native-buy").getAttribute("data-clicked"),
        "yes",
      );
    },
  );
  await check(
    "content reacts to price changes without duplicate injected panels",
    async () => {
      await host
        .locator(".ui-pdp-price__second-line .andes-money-amount__fraction")
        .evaluate((el) => {
          el.textContent = "19";
        });
      await host.waitForFunction(() =>
        window.__messages.some((m) => m.context?.items?.[0]?.price === 19.9),
      );
      assert.equal(await host.locator("[data-radar-owned]").count(), 3);
      const own = await host
        .locator('[data-radar-owned="launcher"]')
        .evaluate((el) =>
          el.shadowRoot
            .querySelector(".launcher-button")
            .getAttribute("aria-label"),
        );
      assert.match(own, /menu/);
    },
  );
  await check(
    "product analysis, both commissions and candidate prices load without clicks",
    async () => {
      const product = host.locator('[data-radar-owned="product-analysis"]');
      await product
        .locator(".auto-types button")
        .first()
        .filter({ hasText: "12%" })
        .waitFor();
      await product
        .locator(".auto-types button")
        .last()
        .filter({ hasText: "16,5%" })
        .waitFor();
      await product
        .locator(".auto-receipt > strong")
        .filter({ hasText: "13,51" })
        .waitFor();
      assert.match(
        await product.locator(".auto-badge").innerText(),
        /a confirmar/,
      );
      assert.match(
        await product.locator(".auto-grid").first().innerText(),
        /-33,67%/,
      );
      const calls = await host.evaluate(() => __messages);
      assert.equal(
        calls.filter((m) => m.type === "RADAR_OPEN_PANEL").length,
        0,
      );
      assert.ok(calls.some((m) => m.path === "/api/extension/observations"));
      const quotes = calls.filter(
        (m) => m.path === "/api/extension/profitability",
      );
      assert.ok(
        quotes.some(
          (m) => m.body.quoteOnly && m.body.listingType === "CLASSIC",
        ),
      );
      assert.ok(
        quotes.some(
          (m) => m.body.quoteOnly && m.body.listingType === "PREMIUM",
        ),
      );
      const countBefore = await host.evaluate(
        () => __messages.filter((m) => m.type === "RADAR_FETCH").length,
      );
      await host.waitForTimeout(650);
      assert.equal(
        await host.evaluate(
          () => __messages.filter((m) => m.type === "RADAR_FETCH").length,
        ),
        countBefore,
        "owned UI changes must not cause request loops",
      );
    },
  );
  await check(
    "saved own costs show opportunity and profit automatically; edits can reveal a loss",
    async () => {
      const product = host.locator('[data-radar-owned="product-analysis"]');
      await host.evaluate(() => {
        __hostQa.own = true;
        __hostQa.rate = 4;
        __hostQa.prefs = { radarTaxPercent: 0 };
        __hostQa.change(
          { radarAccessToken: { oldValue: "a", newValue: "b" } },
          "local",
        );
      });
      await product
        .locator(".auto-result > strong")
        .filter({ hasText: "8,51" })
        .waitFor();
      assert.match(
        await product.locator(".auto-verdict strong").innerText(),
        /Boa oportunidade/,
      );
      assert.equal(
        await product.locator(".auto-badge").innerText(),
        "Alta demanda",
      );
      assert.equal(await product.locator("#radar-auto-cost").inputValue(), "5");
      await product.locator(".auto-types button").last().click();
      await product.locator("#radar-auto-shipping").fill("0");
      await product
        .locator(".auto-result > strong")
        .filter({ hasText: "7,62" })
        .waitFor();
      await product.locator("#radar-auto-cost").fill("18");
      await product
        .locator(".auto-result > strong")
        .filter({ hasText: "5,38" })
        .waitFor();
      assert.equal(
        await product.locator(".auto-verdict strong").innerText(),
        "Ruim para este custo",
      );
      assert.equal(
        await host
          .locator('[data-radar-owned="product"] .auto-summary h2')
          .innerText(),
        "Ruim para este custo",
      );
      for (const width of [390, 680, 1366]) {
        await host.setViewportSize({ width, height: 900 });
        assert.equal(
          await product
            .locator(".surface")
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
          true,
        );
      }
      if (artifacts)
        await host.screenshot({
          path: artifacts + "/automatic-product.png",
          fullPage: true,
        });
    },
  );
  await check(
    "product shortcuts, direct monitoring, menu and hide/restore",
    async () => {
      const product = host.locator('[data-radar-owned="product"]');
      await host
        .locator('[data-radar-owned="product-analysis"]')
        .getByRole("button", { name: "Calculadora completa ↗", exact: true })
        .click();
      assert.equal(
        await host.evaluate(
          () =>
            __messages.filter((m) => m.type === "RADAR_OPEN_PANEL").at(-1)
              .referenceId,
        ),
        "MLBU5074600649",
      );
      assert.equal(
        await host.evaluate(
          () =>
            __messages.filter((m) => m.type === "RADAR_OPEN_PANEL").at(-1).tab,
        ),
        "calculator",
      );
      await host.evaluate(() => {
        __hostQa.auth = false;
      });
      await product
        .getByRole("button", { name: "Monitorar preço", exact: true })
        .click();
      await product
        .getByText("Entre na sua conta Radar", { exact: false })
        .waitFor();
      assert.equal(
        await product
          .getByRole("button", { name: "Monitorar preço", exact: true })
          .isEnabled(),
        true,
      );
      await host.evaluate(() => {
        __hostQa.auth = true;
      });
      await product
        .getByRole("button", { name: "Monitorar preço", exact: true })
        .click();
      await product
        .getByRole("button", { name: "Monitorado ✓", exact: true })
        .waitFor();
      const request = await host.evaluate(() =>
        __messages.filter((m) => m.path === "/api/extension/watchlist").at(-1),
      );
      assert.equal(request.body.observation.id, "MLBU5074600649");
      assert.equal(request.body.observation.price, 19.9);
      await host.evaluate(() =>
        __hostQa.change(
          { radarAccessToken: { oldValue: "client-a", newValue: "client-b" } },
          "local",
        ),
      );
      await product
        .getByRole("button", { name: "Monitorar preço", exact: true })
        .waitFor();
      assert.equal(
        await product
          .getByRole("button", { name: "Monitorar preço", exact: true })
          .isEnabled(),
        true,
      );
      const launcher = host.locator('[data-radar-owned="launcher"]');
      await launcher
        .getByRole("button", {
          name: "Abrir menu do Mercado Radar",
          exact: true,
        })
        .click();
      await launcher
        .getByRole("button", { name: "Calculadora de lucro", exact: true })
        .waitFor();
      await host.keyboard.press("Escape");
      assert.equal(await launcher.locator("nav").isVisible(), false);
      await product
        .getByRole("button", { name: "Ocultar", exact: true })
        .click();
      assert.equal(
        await host.locator('[data-radar-owned="product"]').count(),
        0,
      );
      await launcher
        .getByRole("button", {
          name: "Abrir menu do Mercado Radar",
          exact: true,
        })
        .click();
      await launcher
        .getByRole("button", { name: "Mostrar análise na página", exact: true })
        .click();
      await host.locator('[data-radar-owned="product"]').waitFor();
    },
  );
  if (artifacts)
    await host.screenshot({ path: artifacts + "/host-unchanged.png" });

  const searchPage = await browser.newPage({
    viewport: { width: 1366, height: 900 },
  });
  searchPage.on("pageerror", (error) => errors.push(error.message));
  await searchPage.addInitScript(contentStub);
  const searchFixture = await readFile(
    new URL("tests/fixtures/extension-search.html", root),
    "utf8",
  );
  await searchPage.route("https://lista.mercadolivre.com.br/**", (route) =>
    route.fulfill({ body: searchFixture, contentType: "text/html" }),
  );
  await searchPage.goto("https://lista.mercadolivre.com.br/fio-encerado");
  await searchPage.evaluate(() => {
    __hostQa.rate = 1;
    __hostQa.rates = {
      MLBU5074600640: 4,
      MLBU5074600641: 0.2,
      MLBU5074600642: null,
      MLBU5074600643: 12,
    };
    const sold = document.createElement("p");
    sold.textContent = "+100 vendidos";
    document.querySelectorAll(".poly-card__content")[2].append(sold);
  });
  const cardGeometry = () =>
    searchPage.locator(".poly-card").evaluateAll((nodes) =>
      nodes.map((el) => {
        const native = el.cloneNode(true);
        for (const owned of native.querySelectorAll("[data-radar-owned]"))
          owned.remove();
        for (const fitted of native.querySelectorAll("[data-radar-card-fit]"))
          fitted.removeAttribute("data-radar-card-fit");
        return {
          rect: el.getBoundingClientRect().toJSON(),
          photo: el
            .querySelector(".poly-card__portada")
            .getBoundingClientRect()
            .toJSON(),
          style: el.getAttribute("style"),
          html: native.innerHTML,
        };
      }),
    );
  const searchBefore = await cardGeometry();
  for (const name of [
    "selectors.js",
    "panel-model.js",
    "product-analysis.js",
    "content.js",
  ])
    await searchPage.addScriptTag({ path: new URL(name, extension).pathname });
  await searchPage.locator('[data-radar-owned="search"]').waitFor();
  await check(
    "compact indicators sit after titles, reserve height and preserve photos, columns and native content",
    async () => {
      const after = await cardGeometry();
      const delta = after[0].rect.y - searchBefore[0].rect.y;
      assert.ok(delta > 0);
      for (let i = 0; i < after.length; i++) {
        assert.equal(after[i].style, searchBefore[i].style);
        assert.equal(after[i].html, searchBefore[i].html);
        assert.equal(after[i].rect.width, searchBefore[i].rect.width);
        assert.ok(after[i].rect.height > searchBefore[i].rect.height);
        assert.equal(after[i].rect.x, searchBefore[i].rect.x);
        assert.equal(after[i].photo.width, searchBefore[i].photo.width);
        assert.equal(after[i].photo.height, searchBefore[i].photo.height);
        if (i < 4)
          assert.equal(after[i].rect.y - searchBefore[i].rect.y, delta);
        if (i >= 4) assert.ok(after[i].rect.top >= after[i - 4].rect.bottom);
        assert.equal(after[i].rect.bottom, after[Math.floor(i / 4) * 4].rect.bottom);
      }
      assert.equal(
        await searchPage.locator('[data-radar-owned="card"]').count(),
        8,
      );
      const first = searchPage.locator('[data-radar-owned="card"]').first();
      await first.locator(".intel-pill").filter({ hasText: "Alta" }).waitFor();
      assert.equal(
        await searchPage.evaluate(
          () => __messages.filter((m) => m.type === "RADAR_OPEN_PANEL").length,
        ),
        0,
      );
      assert.equal(
        await searchPage.locator('[data-radar-owned="card"] .analyze').count(),
        0,
      );
      assert.equal(
        await searchPage
          .locator(".poly-card__portada [data-radar-owned]")
          .count(),
        0,
      );
      assert.equal(
        await first.locator(".intel-number").innerText(),
        "R$ 71,60",
      );
      assert.equal(
        await first.locator(".intel-cell small").last().innerText(),
        "receita est./dia",
      );
      assert.match(
        await first.locator(".intel-number").getAttribute("title"),
        /30 dias.*Estimativa bruta/,
      );
      assert.deepEqual(
        await searchPage
          .locator('[data-radar-owned="card"] .intel-pill')
          .allTextContents(),
        [
          "Alta",
          "Baixa",
          "Sem período",
          "Excelente",
          "Média",
          "Média",
          "Média",
          "Média",
        ],
      );
      const unknown = searchPage.locator('[data-radar-owned="card"]').nth(2);
      assert.equal(await unknown.locator(".intel-number").innerText(), "+100");
      assert.equal(
        await unknown.locator(".intel-cell small").last().innerText(),
        "vendidos no total",
      );
      assert.equal(
        await searchPage
          .locator(".poly-component__title")
          .first()
          .getAttribute("href"),
        "https://www.mercadolivre.com.br/fio/up/MLBU5074600640",
      );
      assert.equal(
        await searchPage.locator(".poly-card").evaluateAll((cards) =>
          cards.every((card) => {
            const intel = card.querySelector('[data-radar-owned="card"]');
            const title = card.querySelector(".poly-component__title");
            const price = card.querySelector(".poly-price__current");
            return (
              title.nextElementSibling === intel &&
              intel.getBoundingClientRect().bottom <=
                price.getBoundingClientRect().top &&
              price.getBoundingClientRect().bottom <=
                card.getBoundingClientRect().bottom
            );
          }),
        ),
        true,
      );
      assert.equal(
        searchPage.url(),
        "https://lista.mercadolivre.com.br/fio-encerado",
      );
    },
  );
  await check(
    "search uses one automatic batch and restores native heights when hidden",
    async () => {
      const calls = () =>
        searchPage.evaluate(
          () =>
            __messages.filter((m) => m.path === "/api/extension/observations")
              .length,
        );
      assert.equal(await calls(), 1);
      await searchPage
        .locator('[data-radar-owned="card"] .choose')
        .first()
        .check();
      await searchPage.waitForTimeout(650);
      assert.equal(await calls(), 1);
      await searchPage
        .locator('[data-radar-owned="card"] .choose')
        .first()
        .uncheck();
      const launcher = searchPage.locator('[data-radar-owned="launcher"]');
      await launcher
        .getByRole("button", {
          name: "Abrir menu do Mercado Radar",
          exact: true,
        })
        .click();
      await launcher
        .getByRole("button", { name: "Ocultar análise na página", exact: true })
        .click();
      assert.equal(
        await searchPage
          .locator(
            '[data-radar-owned="card"], [data-radar-owned="card-layout"], [data-radar-card-fit], [data-radar-grid-fit]',
          )
          .count(),
        0,
      );
      assert.deepEqual(await cardGeometry(), searchBefore);
      await searchPage.waitForTimeout(650);
      assert.equal(await calls(), 1);
      await launcher
        .getByRole("button", {
          name: "Abrir menu do Mercado Radar",
          exact: true,
        })
        .click();
      await launcher
        .getByRole("button", { name: "Mostrar análise na página", exact: true })
        .click();
      await searchPage
        .locator('[data-radar-owned="card"]')
        .first()
        .locator(".intel-pill")
        .filter({ hasText: "Alta" })
        .waitFor();
      assert.equal(await calls(), 2);
    },
  );
  await check(
    "reviewed selection computes only its sample and opens comparison with those IDs",
    async () => {
      const shortcuts = searchPage.locator('[data-radar-owned="card"]');
      await shortcuts.nth(0).locator(".choose").click();
      await shortcuts.nth(1).locator(".choose").click();
      await searchPage.evaluate(() => {
        const clone = document.querySelector("#results li").cloneNode(true);
        clone.id = "duplicate-card";
        document.querySelector("#results").append(clone);
      });
      await searchPage.waitForFunction(
        () =>
          document.querySelectorAll('[data-radar-owned="card"]').length === 9,
      );
      assert.doesNotMatch(
        await searchPage
          .locator('[data-radar-owned="search"] .surface')
          .innerText(),
        /mediana/,
      );
      assert.equal(
        await searchPage.locator('[data-radar-owned="search"] h2').innerText(),
        "8 anúncios para analisar",
      );
      await searchPage.evaluate(() =>
        document.getElementById("duplicate-card").remove(),
      );
      await searchPage.waitForFunction(
        () =>
          document.querySelectorAll('[data-radar-owned="card"]').length === 8,
      );
      await shortcuts.nth(2).locator(".choose").click();
      const toolbar = searchPage.locator('[data-radar-owned="search"]');
      await toolbar.getByText(/mediana.*19,90/).waitFor();
      await toolbar
        .getByRole("button", { name: "Comparar (3)", exact: true })
        .click();
      const intent = await searchPage.evaluate(() =>
        __messages.filter((m) => m.type === "RADAR_OPEN_PANEL").at(-1),
      );
      assert.equal(intent.tab, "market");
      assert.deepEqual(intent.selectedIds, [
        "MLBU5074600640",
        "MLBU5074600641",
        "MLBU5074600642",
      ]);
      if (artifacts)
        await searchPage.screenshot({
          path: artifacts + "/contextual-search.png",
        });
      const launcher = searchPage.locator('[data-radar-owned="launcher"]');
      await launcher
        .getByRole("button", {
          name: "Abrir menu do Mercado Radar",
          exact: true,
        })
        .click();
      if (artifacts)
        await searchPage.screenshot({
          path: artifacts + "/contextual-menu.png",
        });
      await searchPage.keyboard.press("Escape");
      await searchPage.evaluate(() =>
        document.querySelector("#results li").remove(),
      );
      await searchPage.waitForFunction(
        () =>
          document.querySelectorAll('[data-radar-owned="card"]').length === 7,
      );
      for (const width of [680, 390]) {
        await searchPage.setViewportSize({ width, height: 900 });
        await searchPage.waitForTimeout(100);
        assert.equal(
          await searchPage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        for (const rect of await searchPage
          .locator('[data-radar-owned="card"]:visible')
          .evaluateAll((els) =>
            els.map((el) => el.getBoundingClientRect().toJSON()),
          ))
          assert.ok(rect.x >= 0 && rect.right <= width);
      }
    },
  );

  await check("search clears prior session insights and ignores its late batch response", async () => {
    await searchPage.evaluate(() => {
      __hostQa.holdObservations = true;
      __hostQa.change({radarAccessToken: {newValue: "next-session"}}, "local");
    });
    await searchPage.waitForFunction(() => typeof __hostQa.releaseObservations === "function");
    await searchPage.evaluate(() => {
      __hostQa.auth = false;
      __hostQa.change({radarAccessToken: {newValue: null}}, "local");
    });
    const pills = searchPage.locator('[data-radar-owned="card"] .intel-pill');
    assert.ok((await pills.allTextContents()).every((text) => text === "Sem período"));
    await searchPage.evaluate(() => __hostQa.releaseObservations());
    await searchPage.waitForTimeout(650);
    assert.ok((await pills.allTextContents()).every((text) => text === "Sem período"));
    assert.equal(await searchPage.locator('[data-radar-owned="card"] .intel-number').filter({hasText: "R$"}).count(), 0);
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const events = {},
      store = {};
    const obs = {
      id: "MLBU5074600649",
      referenceKind: "USER_PRODUCT",
      title: "Fio cordone encerado preto 165m 2mm",
      price: 17.9,
      soldLower: 25,
      soldHasPlus: true,
      soldLabel: "+25 vendidos",
      rating: 4.8,
      reviews: 100,
      permalink: "https://www.mercadolivre.com.br/fio/up/MLBU5074600649",
    };
    window.__qa = {
      obs,
      context: {
        page: "product",
        items: [obs],
        title: obs.title,
        updatedAt: new Date().toISOString(),
        tabId: 1,
      },
      auth: true,
      candidates: [],
      calls: [],
      apiError: false,
      delay: 0,
      activate(context) {
        this.context = context;
        events.activated?.();
      },
      intent(value) {
        const data = {
          id: crypto.randomUUID(),
          issuedAt: Date.now(),
          selectedIds: [],
          ...value,
        };
        store.radarPanelIntent = data;
        events.changed?.({ radarPanelIntent: { newValue: data } }, "session");
      },
    };
    const qa = window.__qa;
    window.chrome = {
      tabs: {
        onActivated: {
          addListener(fn) {
            events.activated = fn;
          },
        },
        onUpdated: {
          addListener(fn) {
            events.updated = fn;
          },
        },
        create: async (data) => {
          qa.createdUrl = data.url;
        },
      },
      storage: {
        sync: {
          get: async () => ({}),
          set: async (data) => Object.assign(store, data),
        },
        session: {
          get: async () => store,
          set: async (data) => Object.assign(store, data),
        },
        onChanged: {
          addListener(fn) {
            events.changed = fn;
          },
        },
      },
      runtime: {
        sendMessage: async (message) => {
          qa.calls.push(message);
          if (message.type === "RADAR_CONTEXT_GET") return qa.context;
          if (message.type === "RADAR_AUTH_STATUS")
            return {
              authenticated: qa.auth,
              extensionProtocol: 2,
              account: { nickname: "Operação teste" },
              access: { plan: "PILOT" },
            };
          if (message.type === "RADAR_AUTH_LOGOUT") {
            qa.auth = false;
            return {};
          }
          if (message.type !== "RADAR_FETCH") return {};
          const ok = (body) => ({ ok: true, status: 200, body });
          if (message.path.startsWith("/api/extension/observations"))
            return ok({ items: [] });
          if (message.path.startsWith("/api/extension/item?"))
            return ok({
              item: null,
              availability: "PAGE_ONLY",
              note: "A API restringiu esta oferta; a leitura da página permanece disponível.",
            });
          if (message.path === "/api/extension/watchlist")
            return ok({
              trackingMode: "PAGE",
              note: "Salvo. Atualiza por novas visitas ao anúncio com o painel aberto.",
            });
          if (message.path.startsWith("/api/extension/market?"))
            return ok({
              competitors: qa.candidates,
              market: null,
              note: qa.candidates.length
                ? "Confira os candidatos antes de selecionar."
                : "Ainda não há amostra. Abra uma busca e selecione anúncios equivalentes.",
            });
          if (message.path === "/api/extension/profitability") {
            if (qa.delay)
              await new Promise((resolve) => setTimeout(resolve, qa.delay));
            if (qa.apiError)
              return {
                ok: false,
                status: 502,
                body: { error: "Consulta indisponível. Tente novamente." },
              };
            const p = message.body,
              rate =
                p.manualFees?.commissionPercent ??
                (p.listingType === "PREMIUM" ? 16.5 : 12),
              fixed = p.manualFees?.fixedFee ?? 4;
            const round = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
            const fees = {
              commissionPercent: rate,
              commissionAmount: round((p.salePrice * rate) / 100),
              fixedFee: fixed,
              shippingCost: p.shippingCost ?? null,
              taxPercent: p.taxPercent ?? null,
              taxAmount:
                p.taxPercent == null
                  ? null
                  : round((p.salePrice * p.taxPercent) / 100),
            };
            const needs = [
              p.shippingCost == null ? "shippingCost" : null,
              p.taxPercent == null ? "taxPercent" : null,
            ].filter(Boolean);
            const body = {
              fees,
              needs,
              feeSource: p.manualFees ? "MANUAL" : "MERCADO_LIVRE_API",
              shippingKnown: false,
              categorySource: "PREDICTED",
              note: "Simulação de custos.",
              result: null,
            };
            if (!needs.length && !p.quoteOnly) {
              const purchase = round(
                  p.supplierPrice *
                    (1 - p.discountPercent / 100) *
                    p.kitQuantity,
                ),
                profit = round(
                  p.salePrice -
                    fees.commissionAmount -
                    fixed -
                    p.shippingCost -
                    fees.taxAmount -
                    p.operatingCost -
                    purchase,
                );
              body.result = {
                ...p,
                purchaseCost: purchase,
                profit,
                commissionPercent: rate,
                commissionAmount: fees.commissionAmount,
                fixedFee: fixed,
                shippingCost: p.shippingCost,
                taxAmount: fees.taxAmount,
                marginPercent: (profit / p.salePrice) * 100,
                roiPercent: (profit / purchase) * 100,
                minimumSuggestedPrice: 21,
              };
            }
            return ok(body);
          }
          return {
            ok: false,
            status: 500,
            body: { error: "Unexpected test request" },
          };
        },
      },
    };
  });
  await page.goto(base + "/sidepanel.html");
  await page
    .locator("#productTitle")
    .filter({ hasText: "Fio cordone" })
    .waitFor();
  await check(
    "restricted details keep calculator and monitoring available",
    async () => {
      await page.locator("#evidenceDetails summary").click();
      await page.locator("#retryApi").click();
      await page
        .locator("#apiStatus")
        .filter({ hasText: "leitura da página permanece" })
        .waitFor();
      assert.equal(await page.locator("#watchButton").isEnabled(), true);
      await page.locator("#watchButton").click();
      await page.locator("#watchStatus").filter({ hasText: "Salvo" }).waitFor();
      assert.equal(await page.locator("#watchButton").isEnabled(), false);
    },
  );
  if (artifacts)
    await page.screenshot({
      path: artifacts + "/extension-reading.png",
      fullPage: true,
    });
  await page.locator('[data-tab="calculator"]').click();
  await check(
    "unknown tax, missing shipping and explicit zero have different states",
    async () => {
      await page.locator("#supplierPrice").fill("10,90");
      await page.locator("#calculate").click();
      await page
        .locator("#calcStatus")
        .filter({ hasText: "imposto" })
        .waitFor({ timeout: 4000 });
      await page.locator("#taxPercent").fill("0");
      await page.locator("#calculate").click();
      await page
        .locator("#calcStatus")
        .filter({ hasText: "seu frete" })
        .waitFor();
      assert.equal(await page.locator("#calcResult").isVisible(), false);
    },
  );
  await check(
    "comma-decimal manual profit and changes invalidate old results",
    async () => {
      await page.locator("#shippingCost").fill("0");
      await page.getByText("Metas e tarifas manuais", { exact: true }).click();
      await page.locator("#manualFees").check();
      await page.locator("#commissionPercent").fill("16,5");
      await page.locator("#fixedFee").fill("0");
      await page.locator("#calculate").click();
      await page.locator("#profit").filter({ hasText: "4,05" }).waitFor();
      assert.match(await page.locator("#resultSource").innerText(), /manuais/);
      assert.equal(await page.locator("#saveSimulation").isVisible(), false);
      if (artifacts)
        await page.screenshot({
          path: artifacts + "/extension-calculator.png",
          fullPage: true,
        });
      await page.locator("#salePrice").fill("18,00");
      assert.equal(await page.locator("#calcResult").isVisible(), false);
    },
  );
  await check(
    "changes during a request never restore a stale profit",
    async () => {
      await page.evaluate(() => {
        __qa.delay = 350;
      });
      await page.locator("#calculate").click();
      await page.locator("#supplierPrice").fill("200");
      await page.waitForFunction(
        () => !document.getElementById("calculate").disabled,
      );
      assert.equal(await page.locator("#calcResult").isVisible(), false);
      await page.evaluate(() => {
        __qa.delay = 0;
      });
    },
  );
  await check("network errors release the calculator for retry", async () => {
    await page.evaluate(() => {
      __qa.apiError = true;
    });
    await page.locator("#calculate").click();
    await page
      .locator("#calcStatus")
      .filter({ hasText: "indisponível" })
      .waitFor();
    assert.equal(await page.locator("#calculate").isEnabled(), true);
    await page.evaluate(() => {
      __qa.apiError = false;
    });
  });
  await page.locator('[data-tab="market"]').click();
  await check(
    "empty comparison gives a usable search action and no invented price range",
    async () => {
      await page.locator("#marketButton").click();
      await page
        .locator("#marketStatus")
        .filter({ hasText: "Ainda não há amostra" })
        .waitFor();
      assert.equal(await page.locator("#marketRange .metric").count(), 0);
      await page.locator("#searchButton").click();
      assert.match(
        await page.evaluate(() => __qa.createdUrl),
        /^https:\/\/lista\.mercadolivre\.com\.br\//,
      );
    },
  );
  await check(
    "selected sample statistics require at least three reviewed listings",
    async () => {
      await page.evaluate(() => {
        __qa.candidates = [20, 30, 40].map((price, i) => ({
          id: "MLBU900000000" + i,
          title: __qa.obs.title,
          price,
          capturedAt: new Date().toISOString(),
          source: "OBSERVED_PAGE",
        }));
      });
      await page.locator("#marketButton").click();
      await page.locator("#candidates .candidate").last().waitFor();
      await page.locator("#selectAll").click();
      assert.match(await page.locator("#marketRange").innerText(), /30,00/);
      await page.locator("#candidates input").first().uncheck();
      assert.equal(await page.locator("#marketRange .metric").count(), 0);
    },
  );
  if (artifacts)
    await page.screenshot({
      path: artifacts + "/extension-comparison.png",
      fullPage: true,
    });
  await check(
    "card shortcuts focus the correct product and comparison retains reviewed IDs",
    async () => {
      await page.evaluate(() => {
        __qa.activate({
          page: "search",
          items: __qa.candidates,
          query: "fio",
          tabId: 2,
          url: "https://lista.mercadolivre.com.br/fio",
          updatedAt: new Date().toISOString(),
        });
      });
      await page
        .locator("#productTitle")
        .filter({ hasText: "Anúncios desta busca" })
        .waitFor();
      await page.evaluate(() =>
        __qa.intent({
          tabId: 2,
          tab: "calculator",
          referenceId: __qa.candidates[1].id,
        }),
      );
      await page.locator("#calculator").waitFor({ state: "visible" });
      assert.equal(await page.locator("#salePrice").inputValue(), "30,00");
      assert.equal(await page.locator("#backToSearch").isVisible(), true);
      await page.locator("#supplierPrice").fill("10");
      await page.locator("#shippingCost").fill("0");
      await page.locator("#calculate").click();
      await page.locator("#calcResult").waitFor({ state: "visible" });
      assert.equal(
        await page.evaluate(
          () =>
            __qa.calls
              .filter((c) => c.path === "/api/extension/profitability")
              .at(-1).body.itemId,
        ),
        "MLBU9000000001",
      );
      await page.evaluate(() =>
        __qa.intent({
          tabId: 99,
          tab: "calculator",
          referenceId: __qa.candidates[0].id,
        }),
      );
      await page.waitForTimeout(50);
      assert.equal(await page.locator("#salePrice").inputValue(), "30,00");
      await page.evaluate(() =>
        __qa.intent({
          tabId: 2,
          tab: "market",
          selectedIds: __qa.candidates.map((c) => c.id),
        }),
      );
      await page.locator("#market").waitFor({ state: "visible" });
      assert.equal(await page.locator("#candidates input:checked").count(), 3);
      assert.match(await page.locator("#marketRange").innerText(), /30,00/);
      assert.equal(await page.locator("#backToSearch").isVisible(), false);
      await page.locator("#candidateSort").selectOption("price-desc");
      assert.match(
        await page.locator("#candidates .candidate-price").first().innerText(),
        /40,00/,
      );
      assert.deepEqual(
        await page.evaluate(() => __qa.context.items.map((i) => i.price)),
        [20, 30, 40],
      );
      await page.locator("#candidateFilter").fill("inexistente");
      assert.equal(await page.locator("#candidates .candidate").count(), 0);
      assert.match(
        await page.locator("#candidateCount").innerText(),
        /3 selecionados/,
      );
      await page.locator("#candidateFilter").fill("");
      assert.equal(await page.locator("#candidates input:checked").count(), 3);
      await page.locator("#clearSelection").click();
      assert.equal(await page.locator("#marketRange .metric").count(), 0);
    },
  );
  await check(
    "search context and unrelated tabs do not reuse the prior product",
    async () => {
      await page.evaluate(() => {
        __qa.activate({
          page: "search",
          items: __qa.candidates,
          query: "fio",
          tabId: 2,
          updatedAt: new Date().toISOString(),
        });
      });
      await page
        .locator("#productTitle")
        .filter({ hasText: "Anúncios desta busca" })
        .waitFor();
      assert.equal(await page.locator("#watchCard").isVisible(), false);
      await page.evaluate(() => __qa.activate(null));
      await page
        .locator("#productTitle")
        .filter({ hasText: "Abra um anúncio" })
        .waitFor();
      assert.equal(await page.locator("#candidates .candidate").count(), 0);
      assert.equal(await page.locator("#calculatorForm").isVisible(), false);
    },
  );
  await check(
    "panel has no horizontal overflow in narrow and wide sidebars",
    async () => {
      await page.evaluate(() =>
        __qa.activate({
          page: "product",
          items: [__qa.obs],
          tabId: 1,
          updatedAt: new Date().toISOString(),
        }),
      );
      await page
        .locator("#productTitle")
        .filter({ hasText: "Fio cordone" })
        .waitFor();
      for (const width of [280, 360, 460, 720]) {
        await page.setViewportSize({ width, height: 900 });
        for (const tab of ["summary", "calculator", "market"]) {
          await page.locator(`[data-tab="${tab}"]`).click();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
            width + " " + tab,
          );
        }
      }
    },
  );
  assert.deepEqual(errors, []);
  console.log(`EXTENSION_BROWSER_OK ${checks} checks; no browser errors`);
} catch (error) {
  console.error("BROWSER_FAILURE", error);
  for (const p of browser.contexts().flatMap((c) => c.pages())) {
    if (await p.locator('[data-radar-owned="product-analysis"]').count()) {
      console.error(
        "PRODUCT_DEBUG",
        await p
          .locator('[data-radar-owned="product-analysis"] .auto-analysis')
          .innerText(),
        await p.evaluate(() =>
          __messages
            .filter((m) => m.path === "/api/extension/profitability")
            .slice(-3),
        ),
      );
      if (artifacts)
        await p.screenshot({
          path: artifacts + "/automatic-failure.png",
          fullPage: true,
        });
    }
    if (p.url().startsWith("https://lista.mercadolivre.com.br") && artifacts)
      await p.screenshot({
        path: artifacts + "/search-failure.png",
        fullPage: true,
      });
    if (p.url().includes("sidepanel")) {
      console.error(
        "PANEL_DEBUG",
        await p.locator("#calcStatus").textContent(),
        await p.locator("#globalStatus").textContent(),
        await p.locator("#authTitle").textContent(),
      );
      if (artifacts)
        await p.screenshot({
          path: artifacts + "/failure.png",
          fullPage: true,
        });
    }
  }
  console.error("PAGE_ERRORS", errors);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

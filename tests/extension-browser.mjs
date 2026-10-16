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
  await host.addInitScript(() => {
    window.__messages = [];
    window.chrome = {
      runtime: {
        onMessage: {
          addListener(fn) {
            window.__contentListener = fn;
          },
        },
        sendMessage: async (message) => {
          window.__messages.push(message);
          return { ok: true };
        },
      },
    };
  });
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
  await host.addScriptTag({ path: new URL("content.js", extension).pathname });
  await check(
    "host layout, price, recommendation IDs and native purchase button",
    async () => {
      assert.deepEqual(await geometry(), before);
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
      assert.equal(await host.locator("[data-radar-owned]").count(), 1);
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
      assert.equal(await host.locator("[data-radar-owned]").count(), 1);
      const own = await host
        .locator("[data-radar-owned]")
        .evaluate((el) =>
          el.shadowRoot.querySelector("button").getAttribute("aria-label"),
        );
      assert.match(own, /painel lateral/);
    },
  );
  if (artifacts)
    await host.screenshot({ path: artifacts + "/host-unchanged.png" });

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
  for (const p of browser.contexts().flatMap((c) => c.pages())) {
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

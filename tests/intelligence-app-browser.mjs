/** Authenticated route smoke against the real production build and isolated ML fixtures.
 * This checks rendering/navigation, not full manual homologation or live seller data.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
export async function runBrowserChecks({ base, cookie }) {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.RADAR_CHROMIUM_PATH
      ? { executablePath: process.env.RADAR_CHROMIUM_PATH }
      : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const artifacts = process.env.RADAR_QA_ARTIFACTS;
  if (artifacts) await mkdir(artifacts, { recursive: true });
  const errors = [],
    [name, ...rest] = cookie.split("=");
  const context = await browser.newContext();
  await context.addCookies([{ name, value: rest.join("="), url: base }]);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const routes = [
    "/",
    "/onboarding",
    "/integracoes",
    "/configuracoes",
    "/mercado",
    "/oportunidades",
    "/monitoramento",
    "/analisar",
    "/historico",
    "/ean",
    "/produtos",
    "/anuncios",
    "/vendas",
    "/publicidade",
    "/fornecedores",
    "/extensao",
    "/concorrentes",
    "/kits",
  ];
  let checks = 0;
  try {
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 960 });
      for (const path of routes) {
        const response = await page.goto(base + path, {
          waitUntil: "domcontentloaded",
        });
        assert.equal(response.status(), 200, path);
        await page.locator(".content h1").first().waitFor();
        assert.equal(await page.locator(".sidebar").count(), 1, path);
        assert.doesNotMatch(
          await page.locator("body").innerText(),
          /Application error:|Internal Server Error/,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `${path} at ${width}`,
        );
        if (artifacts)
          await page.screenshot({
            path: `${artifacts}/app-${path === "/" ? "dashboard" : path.slice(1)}-${width}.png`,
            fullPage: true,
          });
        checks++;
      }
    }
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    await page.getByRole("link", { name: "Concorrentes", exact: true }).click();
    await page
      .getByRole("heading", { name: "Compare o produto certo" })
      .waitFor();
    await page
      .getByLabel("Produto, SKU cadastrado, código MLB ou link")
      .fill("Caneta");
    await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
    await page.locator(".intel-offer").first().waitFor();
    assert.equal(await page.locator(".intel-offer").count(), 20);
    await page
      .getByRole("link", { name: "Simular kits →", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Qual kit vale testar?" })
      .waitFor();
    await page
      .getByRole("button", { name: "Carregar exemplo Montovani" })
      .click();
    await page
      .getByLabel("Preço por unidade para simular (R$)", { exact: true })
      .fill("10");
    await page.getByLabel("Embalagem por kit (R$)", { exact: true }).fill("1");
    await page
      .getByLabel("Frete estimado do vendedor (R$)", { exact: true })
      .fill("6,85");
    await page.locator(".kit-cost-settings > summary").click();
    await page.getByLabel("Consultar automaticamente na minha conta").uncheck();
    await page
      .getByLabel("Comissão manual estimada (%)", { exact: true })
      .fill("12");
    await page
      .getByLabel("Tarifa fixa manual estimada (R$)", { exact: true })
      .fill("4");
    await page
      .getByLabel("Tarifa fixa manual estimada (R$)", { exact: true })
      .blur();
    await page
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await page.getByText(/Rascunho salvo nesta operação/).waitFor();
    checks++;
    const anonymous = await browser.newPage({
      viewport: { width: 390, height: 900 },
    });
    await anonymous.goto(base + "/login");
    await anonymous.locator("form").waitFor();
    assert.equal(
      await anonymous.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    if (artifacts)
      await anonymous.screenshot({
        path: artifacts + "/app-login-390.png",
        fullPage: true,
      });
    checks++;
    assert.deepEqual(errors, []);
    console.log(
      `APP_BROWSER_OK ${checks} checks (18 authenticated routes x 2 widths, competitor-to-kit draft, login); synthetic API and isolated PostgreSQL`,
    );
  } finally {
    await browser.close();
  }
}

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
    "/onde-comprar",
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
        // Existing Sales uses h2 for its page heading; preserve its presentation.
        await page.locator(".content h1, .content h2").first().waitFor();
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
        console.log(`PASS app-browser ${path} at ${width}`);
      }
    }
    await page.goto(base + "/anuncios");
    await page.route("**/api/ml/listing-insights?*", (route) =>
      route.fulfill({ status: 503, json: { error: "Análise temporariamente indisponível" } }));
    const createListing = page.getByRole("link", { name: "Criar anúncio", exact: true }).filter({ visible: true }).last();
    assert.equal(await createListing.getAttribute("href"), "/assistente-anuncios");
    await page.getByRole("button", { name: "Editar", exact: true }).first().click();
    const editor = page.getByRole("region", { name: "Editar anúncio" });
    const stock = editor.getByLabel("Estoque", { exact: true });
    await stock.fill("");
    assert.equal(await stock.getAttribute("aria-invalid"), "true");
    assert.equal(await editor.getByRole("button", { name: "Revisar alteração" }).isDisabled(), true);
    await page.getByText("Análise temporariamente indisponível").waitFor();
    await stock.fill("0");
    assert.equal(await stock.getAttribute("aria-invalid"), "false");
    const status = editor.getByLabel("Status", { exact: false });
    await status.selectOption((await status.inputValue()) === "active" ? "paused" : "active");
    await page.route("**/api/ml/products/edit", async (route) => {
      const change = route.request().postDataJSON();
      assert.equal(change.availableQuantity, 0);
      assert.equal(change.confirm, true);
      await route.fulfill({ status: 502, json: { error: "Estoque alterado, mas o status ficou pendente", applied: { availableQuantity: 0 } } });
    });
    await editor.getByRole("button", { name: "Revisar alteração" }).click();
    await editor.getByRole("button", { name: "Sim, aplicar" }).click();
    await editor.getByRole("alert").getByText("Estoque alterado, mas o status ficou pendente").waitFor();
    await editor.getByRole("button", { name: "Revisar alteração" }).click();
    assert.doesNotMatch(await editor.locator(".insight2-confirm").innerText(), /estoque.*→/i);
    await page.unroute("**/api/ml/products/edit");
    await page.unroute("**/api/ml/listing-insights?*");
    console.log("PASS app-browser listing editor tolerates unavailable insights, distinguishes blank from zero and handles partial edits");
    checks++;
    await page.goto(base + "/assistente-anuncios");
    for (const width of [390, 1366]) {
      await page.setViewportSize({ width, height: 960 });
      await page.getByLabel("Nome do produto", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Publicar no Mercado Livre", exact: true }).waitFor();
      assert.equal(await page.getByText("Custos e frete", { exact: true }).count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (artifacts) await page.screenshot({ path: artifacts + "/criar-anuncio-" + width + ".png", fullPage: true });
    }
    await page.getByLabel("Nome do produto", { exact: true }).fill("Ilhós grafite teste");
    await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
    await page.getByText(/Rascunho salvo com sucesso/).waitFor();
    await page.getByRole("button", { name: "Continuar para publicação" }).click();
    await page.getByRole("heading", { name: "Custos e frete" }).waitFor();
    assert.equal(await page.getByLabel("Nome ou EAN do produto").inputValue(), "Ilhós grafite teste");
    checks++;
    const savedDraft = {
      id: "draft-qa-unconfirmed", status: "PUBLISHING", mlItemId: null,
      data: {
        name: "Produto em confirmação", title: "Produto em confirmação", description: "Descrição",
        brand: "", sku: "", categoryId: "", categoryName: "", confirmedFacts: "", missingFacts: [],
        stock: 1, imageUrls: [], attributes: {}, kitQuantity: 1, discountPercent: 0,
        operatingCost: 0, listingType: "CLASSIC", logisticType: "", freeShipping: null,
        barcode: null, catalogProductId: null, costPerUnit: null, weightGrams: null,
        heightCm: null, widthCm: null, lengthCm: null, suggestedPrice: null,
        publicationChannel: "TRADITIONAL", catalogExactMatchConfirmed: false,
      },
    };
    let checkedDraft = false;
    await page.route("**/api/listing-drafts**", (route) => {
      if (!new URL(route.request().url()).searchParams.has("id"))
        return route.fulfill({ json: { drafts: [{ id: savedDraft.id, name: savedDraft.data.name, status: savedDraft.status }] } });
      const draft = checkedDraft ? {
        ...savedDraft, status: "PUBLISHED", mlItemId: "MLB999000003",
        publicationResult: { permalink: null, message: "Anúncio criado. A pausa não foi confirmada." },
      } : savedDraft;
      checkedDraft = true;
      return route.fulfill({ json: { draft } });
    });
    await page.goto(base + "/assistente-anuncios");
    await page.getByLabel("Meus rascunhos").selectOption(savedDraft.id);
    await page.getByText("Envio aguardando confirmação").waitFor();
    assert.equal(await page.getByRole("button", { name: "Validar anúncio na API do Mercado Livre" }).count(), 0);
    await page.getByRole("button", { name: "Consultar resultado" }).click();
    await page.getByText(/MLB999000003.*pausa não foi confirmada/).waitFor();
    await page.unroute("**/api/listing-drafts**");
    console.log("PASS app-browser draft reconciliation preserves an uncertain pause result");
    checks++;
    const supplier = await context.request.post(base + "/api/sourcing/suppliers", {
      data: { name: "Aviamentos do teste de navegação", kind: "ATACADISTA" },
    });
    assert.equal(supplier.status(), 201, await supplier.text());
    await page.goto(base + "/onde-comprar");
    await page.getByRole("heading", { name: "Encontre fornecedores para um produto" }).waitFor();
    const discovery = page.locator(".vr-home-tool").filter({ hasText: "Descobrir produtos para revender" });
    await discovery.waitFor();
    assert.equal(await discovery.evaluate((element) => element.open), false);
    assert.equal(await page.locator(".hunter").count(), 0, "Discovery should only mount after intentional opening");
    const capitalTool = page.locator(".vr-home-tool").filter({ hasText: "Encontrar opções pelo meu orçamento" });
    assert.equal(await capitalTool.evaluate((element) => element.open), false);
    await page.getByLabel("Link do anúncio ou nome do produto").fill("Ilhós Baxmann Nº 54, 1000 unidades");
    await page.getByText("Orçamento e preço de venda (opcionais)").click();
    await page.getByLabel("Quanto pode investir?").fill("500");
    await page.getByRole("button", { name: "Buscar fornecedores", exact: true }).click();
    await page.waitForURL(/\/onde-comprar\/[^/]+/);
    await page.getByRole("heading", { name: "Fornecedores para este produto" }).waitFor();
    const summary = page.getByRole("region", { name: "Resumo do estudo" });
    await summary.waitFor();
    await summary.getByText("Orçamento para o lote", { exact: true }).waitFor();
    assert.match(await summary.innerText(), /R\$\s*500,00/);
    assert.equal(await page.getByRole("tablist", { name: "Etapas" }).count(), 1);
    assert.equal(await page.getByLabel("Próximo passo", { exact: true }).count(), 1);
    await page.getByText(/Busca automática desligada/).waitFor();
    // Simula apenas a resposta do provedor para validar filtros e cadastro de candidatos.
    await page.route("**/api/sourcing/opportunities/*/search", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const baseCandidate = { reasons: ["Menciona atacado"], snippet: null, query: "teste" };
      await route.fulfill({ json: { search: { status: "OK", message: null, discarded: 0, queries: [], manualLinks: [], searchedAt: new Date().toISOString(), candidates: [
        { ...baseCandidate, name: "Fabricante fixture", url: "https://fabricante.example.com", domain: "fabricante.example.com", kind: "FABRICANTE", evidence: "PRODUTO" },
        { ...baseCandidate, name: "Distribuidor fixture", url: "https://distribuidor.example.com", domain: "distribuidor.example.com", kind: "DISTRIBUIDOR", evidence: "MARCA", origin: "IA", city: "Cidade sugerida", state: "MG", sellsToCpf: true }
      ] } } });
    });
    await page.getByRole("button", { name: "Buscar de novo" }).click();
    await page.getByText("2 de 2 candidatos.", { exact: false }).waitFor();
    await page.getByLabel("Somente resultados com sinal do produto").check();
    await page.getByText("1 de 2 candidatos.", { exact: false }).waitFor();
    assert.equal(await page.getByText("Distribuidor fixture", { exact: true }).count(), 0);
    await page.getByLabel("Somente resultados com sinal do produto").uncheck();
    await page.getByLabel("Tipo de fornecedor", { exact: true }).selectOption("DISTRIBUIDOR");
    await page.getByText("Distribuidor fixture", { exact: true }).waitFor();
    const evidence = page.locator(".vr-candidates details").first();
    assert.equal(await evidence.evaluate((element) => element.open), false);
    await evidence.locator("summary").click();
    await page.getByText("Venda para CPF: possivelmente sim", { exact: false }).waitFor();
    await evidence.locator("summary").click();
    assert.equal(await page.getByText("Fabricante fixture", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    assert.equal(await page.getByLabel("Cidade", { exact: true }).inputValue(), "");
    assert.equal(await page.getByLabel("UF", { exact: true }).inputValue(), "");
    assert.equal(await page.locator('select[name="sellsToCpf"]').inputValue(), "");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.unroute("**/api/sourcing/opportunities/*/search");
    console.log("PASS app-browser supplier evidence filters and unverified AI data");
    checks++;
    await page.getByRole("button", { name: "Usar fornecedor salvo" }).click();
    const directory = page.locator('select[name="supplierId"]');
    await directory.waitFor();
    await directory.selectOption({ label: "Aviamentos do teste de navegação" });
    await page.getByRole("button", { name: "Vincular ao produto" }).click();
    await page.getByRole("button", { name: "Registrar cotação" }).click();
    await page.getByLabel("Preço informado (R$)").fill("19,99");
    await page.getByLabel("Peças por embalagem").fill("1000");
    await page.getByLabel("Mínimo (peças)").fill("5000");
    await page.getByLabel("Mesmo produto e variante?").selectOption("sim");
    await page.getByRole("button", { name: "Salvar cotação" }).click();
    await page.getByText(/R\$\s*19,99 \/ 1.000 un/).waitFor();
    await page.getByRole("tab", { name: "Comparar cotações" }).click();
    await page.getByText("+ frete a confirmar", { exact: true }).waitFor();
    await page.locator(".vr-table.is-labeled tbody tr").first().waitFor();
    for (const width of [390, 1366]) {
      await page.setViewportSize({ width, height: 960 });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, undefined, { timeout: 5000 });
      if (width === 390) {
        const column = page.locator(".vr-table td[data-label='Condições']").first();
        assert.equal(await column.evaluate((cell) => getComputedStyle(cell, "::before").position), "static");
      }
      if (artifacts) await page.screenshot({ path: `${artifacts}/onde-comprar-comparar-${width}.png`, fullPage: true });
    }
    const studyId = new URL(page.url()).pathname.split("/").pop();
    const costs = await context.request.patch(base + "/api/sourcing/opportunities/" + studyId, { data: {
      referencePrice: 42.9, commissionPercent: 12, fixedFee: 6, shippingCost: 0, taxPercent: 3, operatingCost: 1, packQuantity: 1000,
    }});
    assert.ok(costs.ok(), await costs.text());
    const received = await context.request.post(base + "/api/sourcing/quotes", { data: {
      opportunityId: studyId, supplierId: (await supplier.json()).supplier.id, unitPrice: 0.018, unitsPerPack: 1000,
      minUnits: 5000, freightCost: 0, otherCosts: 0, exactMatch: true, source: "COTACAO_RECEBIDA",
    }});
    assert.equal(received.status(), 201, await received.text());
    const study = await received.json();
    assert.ok(study.purchaseLimit.perListing > 0);
    assert.ok(study.best.order.capital <= 500);
    await page.reload();
    await page.getByRole("tab", { name: "Comparar cotações" }).click();
    await page.getByRole("link", { name: "Criar rascunho com esta cotação" }).click();
    await page.getByText(/Referência de compra:.*18,00 por pacote entregue/).waitFor();
    await page.getByRole("button", { name: "Publicar no Mercado Livre", exact: true }).click();
    assert.equal(await page.getByLabel("Custo de compra por unidade (R$)").inputValue(), "18");
    console.log("PASS app-browser budget, delivered package cost and explicit publication review");
    checks++;
    await page.setViewportSize({ width: 390, height: 960 });
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    const more = page.locator(".sidebar details.nav-more");
    if (!(await more.evaluate(el => el.open))) await more.locator("summary").click();
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
      `APP_BROWSER_OK ${checks} checks (authenticated routes x 2 widths, sourcing, competitor-to-kit draft, login); synthetic API and isolated PostgreSQL`,
    );
  } finally {
    await browser.close();
  }
}

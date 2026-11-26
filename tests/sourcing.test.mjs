import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { extractIdentity, isValidGtin, packQuantityFromTitle } = await loadTs(
  "../lib/sourcing/identity.ts",
);
const { isValidCnpj, normalizeCnpj, mapBrasilApiCnpj, lookupCnpj, formatCnpj } =
  await loadTs("../lib/sourcing/cnpj.ts");
const { classifyResult, buildSupplierQueries, searchSuppliers, isRetail, manualSearchLinks } =
  await loadTs("../lib/sourcing/search.ts");
const { qualifySupplier } = await loadTs("../lib/sourcing/qualification.ts");
const { evaluateQuote, bestViability, recommendNextAction, maxUnitCostForMargin } =
  await loadTs("../lib/sourcing/viability.ts");
const { matchByCapital } = await loadTs("../lib/sourcing/capital.ts");

test("identidade usa atributos do anúncio e não confunde nº 54 com quantidade", () => {
  const identity = extractIdentity({
    title: "Ilhós Nº 54 Alumínio Baxmann 1000 Unidades",
    attributes: [
      { id: "BRAND", value_name: "Baxmann" },
      { id: "MODEL", value_name: "54" },
      { id: "GTIN", value_name: "7894900011517" },
    ],
  });
  assert.equal(identity.brand, "Baxmann");
  assert.equal(identity.model, "54");
  assert.equal(identity.gtin, "7894900011517");
  assert.equal(identity.gtinValid, true);
  assert.equal(identity.packQuantity, 1000);
  assert.equal(identity.packQuantitySource, "TITULO");
  assert.ok(identity.searchTerms[0].includes("Baxmann"));
  assert.ok(!identity.searchTerms[1].toLowerCase().includes("baxmann baxmann"));
});

test("marca genérica e quantidade ausente ficam nulas", () => {
  const identity = extractIdentity({
    title: "Arame Encapado 165m Verde",
    attributes: [{ id: "BRAND", value_name: "Genérica" }],
  });
  assert.equal(identity.brand, null);
  assert.equal(identity.packQuantity, null);
  assert.equal(identity.gtin, null);
  assert.equal(identity.gtinValid, null);
});

test("quantidade por pacote: atributo vence o título; medidas não contam", () => {
  assert.equal(packQuantityFromTitle("Kit 50 peças base broche"), 50);
  assert.equal(packQuantityFromTitle("Bastão cola quente c/ 1.000 un"), 1000);
  assert.equal(packQuantityFromTitle("Fita cetim 10m"), null);
  assert.equal(packQuantityFromTitle("Com 100ml"), null);
  const identity = extractIdentity({
    title: "Kit 50 bases",
    attributes: [{ id: "UNITS_PER_PACK", value_name: "48" }],
  });
  assert.equal(identity.packQuantity, 48);
  assert.equal(identity.packQuantitySource, "ATRIBUTO");
  assert.equal(isValidGtin("7894900011518"), false);
});

test("CNPJ: dígitos verificadores, formatação e mapeamento da BrasilAPI", () => {
  assert.equal(isValidCnpj("00.000.000/0001-91"), true);
  assert.equal(isValidCnpj("00.000.000/0001-92"), false);
  assert.equal(isValidCnpj("11111111111111"), false);
  assert.equal(normalizeCnpj("123"), null);
  assert.equal(formatCnpj("00000000000191"), "00.000.000/0001-91");
  const check = mapBrasilApiCnpj(
    "00000000000191",
    {
      razao_social: "EMPRESA TESTE SA",
      situacao_cadastral: 2,
      descricao_situacao_cadastral: "ATIVA",
      cnae_fiscal: 4649408,
      cnae_fiscal_descricao: "Comércio atacadista",
      uf: "MG",
      municipio: "BELO HORIZONTE",
      ddd_telefone_1: "3132221234",
      email: "Vendas@Empresa.com.br",
      descricao_tipo_de_logradouro: "RUA",
      logradouro: "DOS GUAJAJARAS",
      numero: "100",
      bairro: "CENTRO",
      cep: "30180100",
    },
    new Date("2026-11-25T12:00:00Z"),
  );
  assert.equal(check.phone, "(31) 3222-1234");
  assert.equal(check.email, "vendas@empresa.com.br");
  assert.equal(check.address, "RUA DOS GUAJAJARAS, 100, CENTRO");
  assert.equal(check.zipCode, "30180-100");
  assert.equal(check.status, "ATIVA");
  assert.equal(check.state, "MG");
  assert.match(check.mainActivity, /4649408/);
  assert.equal(check.simples, null);
});

test("CNPJ: indisponibilidade e 404 são erros distintos, sem inventar situação", async () => {
  await assert.rejects(
    lookupCnpj("00000000000191", async () => new Response("", { status: 404 })),
    (error) => error.code === "NOT_FOUND",
  );
  await assert.rejects(
    lookupCnpj("00000000000191", async () => {
      throw new Error("offline");
    }),
    (error) => error.code === "UNAVAILABLE",
  );
  await assert.rejects(lookupCnpj("123"), (error) => error.code === "INVALID");
});

test("busca descarta varejo e classifica fornecedores com razões", () => {
  assert.equal(isRetail("magazineluiza.com.br"), true);
  assert.equal(isRetail("m.magazineluiza.com.br"), true);
  assert.equal(
    classifyResult({ title: "Ilhós 54 | Magalu", url: "https://www.magazineluiza.com.br/x" }, "q"),
    null,
  );
  const maker = classifyResult(
    { title: "Baxmann - Seja um revendedor", url: "https://www.baxmann.ind.br/revenda", description: "Fabricante de ilhós" },
    "q",
  );
  assert.equal(maker.kind, "FABRICANTE");
  assert.ok(maker.reasons.includes("Tem programa de revenda"));
  const mlStore = classifyResult(
    { title: "CB Atacado Distribuidora", url: "https://www.mercadolivre.com.br/loja/cb-atacado-distribuidora" },
    "q",
  );
  assert.equal(mlStore.kind, "LOJA_ML");
  assert.equal(
    classifyResult({ title: "Ilhós 54 prata", url: "https://produto.mercadolivre.com.br/MLB-1" }, "q"),
    null,
  );
  assert.equal(
    classifyResult({ title: "Blog sobre artesanato", url: "https://blog.exemplo.com.br" }, "q"),
    null,
  );
});

test("busca desligada não inventa fornecedor e oferece links manuais", async () => {
  const identity = extractIdentity({ title: "Ilhós 54 Baxmann", attributes: [{ id: "BRAND", value_name: "Baxmann" }] });
  const queries = buildSupplierQueries(identity);
  assert.ok(queries[0].query.includes("Baxmann"));
  const outcome = await searchSuppliers(identity, null);
  assert.equal(outcome.status, "DESLIGADO");
  assert.equal(outcome.candidates.length, 0);
  assert.ok(outcome.manualLinks.length >= 3);
  assert.ok(manualSearchLinks(identity)[0].label.includes("Baxmann"));
});

test("busca com provedor junta candidatos por domínio e trata falha total", async () => {
  const identity = extractIdentity({ title: "Bastão cola quente 1kg" });
  const provider = async (query) => [
    { title: "Cola Quente Ind | Fabricante", url: "https://colaquente.ind.br/a", description: "Fábrica" },
    { title: "Cola Quente Ind - Atacado", url: "https://colaquente.ind.br/b", description: "atacado" },
    { title: "Bastão | Americanas", url: "https://www.americanas.com.br/p" },
  ];
  const outcome = await searchSuppliers(identity, provider);
  assert.equal(outcome.status, "OK");
  assert.equal(outcome.candidates.length, 1);
  assert.ok(outcome.discarded > 0);
  const failed = await searchSuppliers(identity, async () => {
    throw new Error("429");
  });
  assert.equal(failed.status, "INDISPONIVEL");
  assert.equal(failed.candidates.length, 0);
});

const supplierBase = {
  cnpj: null,
  cnpjCheck: null,
  sellsToCpf: null,
  requiresCnpj: null,
  issuesInvoice: null,
  servesSmall: null,
  minOrderValue: null,
  minOrderUnits: null,
  leadTimeDays: null,
  state: null,
  reputationNote: null,
};

test("qualificação sem dados é insuficiente e pede o dado essencial primeiro", () => {
  const result = qualifySupplier(supplierBase, null);
  assert.equal(result.level, "INSUFICIENTE");
  assert.equal(result.confirmed, 0);
  assert.equal(result.total, 9);
  assert.equal(result.nextAsk, "Confirmar marca, modelo e quantidade");
});

test("qualificação: estimativa não conta como preço; CNPJ inativo bloqueia", () => {
  const estimate = qualifySupplier(supplierBase, {
    unitPrice: 0.04, source: "ESTIMATIVA_USUARIO", exactMatch: true, freightCost: null,
  });
  assert.equal(estimate.criteria.find((c) => c.key === "price").state, "PENDENTE");
  const blocked = qualifySupplier(
    { ...supplierBase, cnpj: "00000000000191", cnpjCheck: { status: "BAIXADA", statusLabel: "BAIXADA", checkedAt: "2026-11-25T00:00:00Z" } },
    null,
  );
  assert.equal(blocked.level, "BLOQUEADO");
  const cpf = qualifySupplier({ ...supplierBase, requiresCnpj: true }, null, { buyerHasCnpj: false, buyerState: "MG" });
  assert.equal(cpf.level, "BLOQUEADO");
});

test("qualificação completa vira qualificado", () => {
  const result = qualifySupplier(
    {
      ...supplierBase,
      cnpj: "00000000000191",
      cnpjCheck: { status: "ATIVA", statusLabel: "ATIVA", checkedAt: "2026-11-25T00:00:00Z" },
      sellsToCpf: true,
      issuesInvoice: true,
      minOrderUnits: 1000,
      leadTimeDays: 5,
      state: "MG",
      reputationNote: "Compra anterior sem problema",
    },
    { unitPrice: 0.03, source: "COTACAO_RECEBIDA", exactMatch: true, freightCost: 25 },
    { buyerHasCnpj: false, buyerState: "MG" },
  );
  assert.equal(result.level, "QUALIFICADO");
  assert.equal(result.confirmed, 9);
  assert.equal(result.nextAsk, null);
});

const sale = {
  salePrice: 42.9,
  saleUnits: 1000,
  listingType: "CLASSIC",
  commissionPercent: 12,
  fixedFee: 6.25,
  shippingCost: 0,
  taxPercent: 6,
  operatingCost: 1,
  targetMarginPercent: 20,
  targetRoiPercent: 30,
  budget: null,
  monthlyDemand: null,
};
const quote = {
  id: "q1",
  supplierId: "s1",
  supplierName: "Distribuidor X",
  unitPrice: 0.018,
  unitsPerPack: 1000,
  minUnits: 5000,
  freightCost: 30,
  otherCosts: null,
  source: "COTACAO_RECEBIDA",
  exactMatch: true,
  supplierMinOrderUnits: null,
  supplierMinOrderValue: null,
};

test("viabilidade: custo entregue rateia frete e usa o motor de margem", () => {
  const v = evaluateQuote(sale, quote);
  assert.equal(v.status, "CALCULADO");
  assert.equal(v.order.minimumUnits, 5000);
  assert.equal(v.order.units, 5000);
  assert.equal(v.order.sellableListings, 5);
  assert.equal(v.order.capital, 120);
  // 0,018 + 30/5000 de frete = 0,024 por peça; arredondar para 0,02 esconderia R$ 4 por venda.
  assert.equal(v.landedUnitCost, 0.024);
  assert.equal(v.perSale.purchaseCost, 24);
  assert.ok(v.perSale.profit > 0);
  assert.ok(v.plan.salesToRecoverCapital >= 1);
  assert.ok(!v.risks.some((r) => r.text.includes("estimativa")));
});

test("viabilidade: orçamento abaixo do pedido mínimo e dados de venda ausentes", () => {
  const poor = evaluateQuote({ ...sale, budget: 50 }, quote);
  assert.equal(poor.status, "CAPITAL_INSUFICIENTE");
  assert.equal(poor.risks[0].level, "ALTO");
  const rich = evaluateQuote({ ...sale, budget: 500 }, quote);
  assert.equal(rich.order.limitedBy, "ORCAMENTO");
  assert.equal(rich.order.units % 1000, 0);
  assert.ok(rich.order.capital <= 500);
  const missing = evaluateQuote({ ...sale, commissionPercent: null, shippingCost: null }, quote);
  assert.equal(missing.status, "FALTAM_DADOS");
  assert.deepEqual(missing.missing, ["comissão do Mercado Livre", "frete do vendedor"]);
  assert.equal(missing.perSale, null);
  assert.equal(maxUnitCostForMargin({ ...sale, commissionPercent: null }), null);
});

test("viabilidade: demanda limita o estoque e estimativa vira risco alto", () => {
  const v = evaluateQuote(
    { ...sale, budget: 5000, monthlyDemand: 3 },
    { ...quote, source: "ESTIMATIVA_USUARIO", exactMatch: null, freightCost: null },
  );
  assert.equal(v.order.limitedBy, "DEMANDA");
  assert.equal(v.order.units, 6000);
  assert.equal(v.plan.monthsOfStock, 2);
  assert.equal(v.risks[0].level, "ALTO");
  assert.ok(v.risks.some((r) => r.text.includes("Frete")));
});

test("custo máximo por peça preserva centavos fracionados", () => {
  const value = maxUnitCostForMargin(sale);
  assert.ok(value > 0.01 && value < 0.03, String(value));
  assert.notEqual(Math.round(value * 100) / 100, value);
  const tight = recommendNextAction({ sale, supplierCount: 1, quoteCount: 1, best: evaluateQuote(sale, quote) });
  assert.match(tight.detail, /0,0\d{2,}/);
});

test("próxima ação segue a jornada", () => {
  assert.equal(
    recommendNextAction({ sale: { ...sale, salePrice: null }, supplierCount: 0, quoteCount: 0, best: null }).tab,
    "fornecedores",
  );
  assert.equal(
    recommendNextAction({ sale, supplierCount: 0, quoteCount: 0, best: null }).title,
    "Encontrar fornecedores",
  );
  assert.equal(
    recommendNextAction({ sale, supplierCount: 1, quoteCount: 0, best: null }).title,
    "Solicitar cotação de atacado",
  );
  const good = evaluateQuote(sale, quote);
  const estimate = evaluateQuote(sale, { ...quote, id: "q2", source: "ESTIMATIVA_USUARIO" });
  assert.equal(bestViability([estimate, good]).quoteId, "q1");
  assert.match(recommendNextAction({ sale, supplierCount: 1, quoteCount: 2, best: good }).title, /Planejar compra|Negociar/);
  const bad = evaluateQuote({ ...sale, salePrice: 12 }, quote);
  assert.equal(recommendNextAction({ sale: { ...sale, salePrice: 12 }, supplierCount: 1, quoteCount: 1, best: bad }).title, "Negociar ou descartar");
});

test("radar por capital filtra por dinheiro, perfil e margem", () => {
  const good = evaluateQuote(sale, quote);
  const result = matchByCapital(
    [
      { opportunityId: "a", title: "Ilhós", viability: good, supplierKind: "DISTRIBUIDOR", sellsToCpf: true, requiresCnpj: false },
      { opportunityId: "b", title: "Cola", viability: good, supplierKind: "DISTRIBUIDOR", sellsToCpf: false, requiresCnpj: true },
    ],
    { capital: 200, profile: "CPF", minMarginPercent: 5 },
  );
  assert.deepEqual(result.matches.map((m) => m.opportunityId), ["a"]);
  assert.ok(result.excluded[0].reasons.includes("Não vende para CPF"));
  const tooPoor = matchByCapital(
    [{ opportunityId: "a", title: "Ilhós", viability: good, supplierKind: "FABRICANTE", sellsToCpf: true, requiresCnpj: false }],
    { capital: 50, profile: "TODOS", minMarginPercent: 0 },
  );
  assert.equal(tooPoor.matches.length, 0);
});


test("busca retém a página do modelo e descarta atacadista de outro produto", async () => {
  const identity = extractIdentity({
    title: "Ilhós Nº 54 Alumínio Baxmann 1000 unidades",
    attributes: [{ id: "BRAND", value_name: "Baxmann" }, { id: "MODEL", value_name: "54" }, { id: "GTIN", value_name: "7894900011517" }],
  });
  assert.ok(buildSupplierQueries(identity).some((row) => row.query === "7894900011517"));
  const outcome = await searchSuppliers(identity, async () => [
    { title: "Distribuidor atacadista de pneus", url: "https://pneus.exemplo.com.br/" },
    { title: "Representantes Baxmann", url: "https://baxmann.exemplo.com.br/representantes" },
    { title: "Ilhós Baxmann 54 1000 un. alumínio", url: "https://aviamentos.exemplo.com.br/ilhos-54" },
    { title: "Ilhós Baxmann 45 1000 un. alumínio", url: "https://outro.exemplo.com.br/ilhos-45" },
  ]);
  assert.deepEqual(outcome.candidates.map((candidate) => candidate.evidence), ["PRODUTO", "MARCA"]);
  assert.ok(outcome.candidates.every((candidate) => !candidate.url.includes("pneus")));
});

test("estimativa sem frete e cotação vencida ficam atrás de condição confirmada", () => {
  const confirmed = evaluateQuote(sale, quote);
  const pending = evaluateQuote(sale, { ...quote, id: "pending", freightCost: null, source: "ESTIMATIVA_USUARIO" });
  const expired = evaluateQuote(sale, { ...quote, id: "expired", unitPrice: 0.005, expired: true });
  assert.equal(pending.perSale, null);
  assert.equal(pending.status, "FALTAM_DADOS");
  assert.equal(bestViability([pending, expired, confirmed]).quoteId, quote.id);
  assert.equal(recommendNextAction({ sale, supplierCount: 1, quoteCount: 1, best: pending }).tab, "fornecedores");
  const missingShipping = evaluateQuote({ ...sale, shippingCost: null }, quote);
  assert.equal(recommendNextAction({ sale, supplierCount: 1, quoteCount: 1, best: missingShipping }).tab, "mercado");
});


test("viabilidade exige tributos e custos operacionais explícitos, inclusive zero", () => {
  const incomplete = evaluateQuote({ ...sale, taxPercent: null, operatingCost: null }, quote);
  assert.equal(incomplete.status, "FALTAM_DADOS");
  assert.deepEqual(incomplete.missing, ["tributos", "custos operacionais"]);
  assert.equal(incomplete.perSale, null);
  assert.equal(incomplete.maxUnitCostForTarget, null);
  assert.equal(recommendNextAction({ sale, supplierCount: 1, quoteCount: 1, best: incomplete }).tab, "mercado");
  const explicitZero = evaluateQuote({ ...sale, taxPercent: 0, operatingCost: 0 }, quote);
  assert.equal(explicitZero.status, "CALCULADO");
  assert.ok(explicitZero.perSale);
});

test("capital zero não vira orçamento ilimitado e alternativa acessível tem prioridade", () => {
  const zero = evaluateQuote({ ...sale, budget: 0 }, quote);
  assert.equal(zero.status, "CAPITAL_INSUFICIENTE");
  const confirmed = evaluateQuote({ ...sale, budget: 100 }, quote);
  const accessible = evaluateQuote({ ...sale, budget: 100 }, { ...quote, id: "accessible", minUnits: 1000, source: "PRECO_PUBLICADO" });
  assert.equal(confirmed.status, "CAPITAL_INSUFICIENTE");
  assert.equal(accessible.status, "CALCULADO");
  assert.equal(bestViability([confirmed, accessible]).quoteId, "accessible");
  assert.equal(recommendNextAction({ sale, supplierCount: 2, quoteCount: 2, best: accessible }).tab, "fornecedores");
});

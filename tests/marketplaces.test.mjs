import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { normalizePrices, normalizeSeller, normalizeQuestions, normalizeReviews, normalizeCategory } =
  await loadTs("../lib/marketplaces/mercado-livre/normalize.ts");
const { reconcileAiSuppliers, confirmContacts, parseJsonLoose, groundedSources, buildResearchPrompt } =
  await loadTs("../lib/sourcing/ai-research.ts");
const { withAiResearch } = await loadTs("../lib/sourcing/search.ts");
const { isAllowedPublicUrl } = await loadTs("../lib/sourcing/safe-page.ts");

test("preços: varejo, preço CNPJ e faixas por quantidade sem misturar", () => {
  const out = normalizePrices([
    { type: "standard", amount: 42.9, currency_id: "BRL", conditions: { context_restrictions: [], min_purchase_unit: 1 } },
    { type: "promotion", amount: 39.9, regular_amount: 42.9, currency_id: "BRL", conditions: { context_restrictions: ["channel_marketplace"] } },
    { type: "standard", amount: 37, conditions: { context_restrictions: ["user_type_business"], min_purchase_unit: 1 } },
    { type: "standard", amount: 35, conditions: { min_purchase_unit: 10 } },
    { type: "standard", amount: 36, conditions: { min_purchase_unit: 10 } },
    { type: "standard", amount: 31.5, conditions: { context_restrictions: ["user_type_business"], min_purchase_unit: 50 } },
    { type: "standard", amount: 0, conditions: { min_purchase_unit: 100 } },
  ]);
  assert.equal(out.consumerPrice, 39.9);
  assert.equal(out.regularPrice, 42.9);
  assert.equal(out.promotion, true);
  assert.equal(out.businessPrice, 37);
  assert.deepEqual(out.tiers, [
    { minUnits: 10, unitPrice: 35, businessOnly: false },
    { minUnits: 50, unitPrice: 31.5, businessOnly: true },
  ]);
  assert.equal(normalizePrices([]), null);
});

test("vendedor: termômetro, medalha, UF e taxas inválidas viram nulo", () => {
  const s = normalizeSeller({
    id: 123,
    nickname: "LOJA X",
    address: { city: "Belo Horizonte", state: "BR-MG" },
    tags: ["brand", "normal"],
    seller_reputation: {
      level_id: "5_green",
      power_seller_status: "platinum",
      transactions: { completed: 900, period: "historic", ratings: { positive: 0.97 } },
      metrics: { sales: { period: "60 days", completed: 320 }, claims: { rate: 0.004 }, cancellations: { rate: 7 } },
    },
  });
  assert.equal(s.state, "MG");
  assert.equal(s.levelScore, 5);
  assert.equal(s.levelColor, "green");
  assert.equal(s.medal, "MercadoLíder Platinum");
  assert.equal(s.completedSales, 320);
  assert.equal(s.cancellationsRate, null);
  assert.equal(s.officialStore, true);
  assert.equal(normalizeSeller({}), null);
});

test("perguntas: tópicos de compra e contagem de sem resposta", () => {
  const q = normalizeQuestions({
    total: 57,
    questions: [
      { text: "Vende no atacado? Preciso de 500 unidades", status: "UNANSWERED" },
      { text: "Qual a medida em mm?", answer: { text: "5 mm" } },
      { text: "Emite nota fiscal?", status: "ANSWERED" },
      { text: "  " },
    ],
  });
  assert.equal(q.total, 57);
  assert.equal(q.sampled, 3);
  assert.equal(q.unansweredInSample, 1);
  assert.deepEqual(q.topics.map((t) => t.topic).sort(), ["MEDIDA", "NOTA_FISCAL", "QUANTIDADE_ATACADO"]);
});

test("opiniões: sem opinião não vira nota zero", () => {
  assert.equal(normalizeReviews({ paging: { total: 0 }, rating_average: 0 }).average, null);
  const r = normalizeReviews({
    paging: { total: 12 },
    rating_average: 4.46,
    rating_levels: { one_star: 1, two_star: 0, three_star: 1, four_star: 3, five_star: 7 },
    reviews: [{ content: "Veio menor", rate: 2 }, { content: "Ótimo", rate: 5 }],
  });
  assert.equal(r.average, 4.5);
  assert.equal(r.distribution[5], 7);
  assert.deepEqual(r.recentCritical.map((x) => x.rate), [2]);
});

test("categoria: obrigatórios e o que falta no anúncio de referência", () => {
  const c = normalizeCategory(
    { id: "MLB1234", name: "Ilhoses", path_from_root: [{ name: "Arte" }, { name: "Ilhoses" }] },
    [
      { id: "BRAND", name: "Marca", tags: { required: true } },
      { id: "GTIN", name: "Código universal", tags: { catalog_required: true } },
      { id: "COLOR", name: "Cor", tags: {} },
      { id: "SELLER_SKU", name: "SKU", tags: { required: true, read_only: true } },
    ],
    ["BRAND"],
  );
  assert.deepEqual(c.path, ["Arte", "Ilhoses"]);
  assert.deepEqual(c.requiredAttributes.map((a) => a.id), ["BRAND", "GTIN"]);
  assert.deepEqual(c.missingInReference.map((a) => a.id), ["GTIN"]);
});

const chunks = [
  { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "baxmann.com.br" } },
  { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/def", title: "atacadao-aviamentos.com.br" } },
  { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ghi", title: "amazon.com.br" } },
];

test("IA: só fica fornecedor com site entre as fontes do Google; varejo e inventado saem", () => {
  const reply = parseJsonLoose(
    '```json\n{"suppliers":[' +
      '{"name":"Baxmann","website":"https://www.baxmann.com.br/revenda","kind":"FABRICANTE","phone":"(11) 4000-1234","email":"vendas@baxmann.com.br","cnpj":"00.000.000/0001-91","state":"SP"},' +
      '{"name":"Inventada Ltda","website":"inventada.com.br","kind":"DISTRIBUIDOR"},' +
      '{"name":"Amazon","website":"https://amazon.com.br","kind":"OUTRO"},' +
      '{"name":"Atacadão","website":"atacadao-aviamentos.com.br","kind":"QUALQUER","cnpj":"11.111.111/1111-11"},' +
      '{"bad":true}]}\n```',
  );
  const { candidates, rejected } = reconcileAiSuppliers(reply, chunks);
  assert.deepEqual(candidates.map((c) => c.domain), ["baxmann.com.br", "atacadao-aviamentos.com.br"]);
  assert.equal(rejected, 3);
  const [bax, atac] = candidates;
  assert.equal(bax.kind, "FABRICANTE");
  assert.equal(bax.state, "SP");
  assert.equal(bax.cnpj.value, "00000000000191");
  assert.equal(bax.phone.verified, false);
  assert.equal(bax.sources.length, 1);
  assert.equal(atac.kind, "OUTRO");
  assert.equal(atac.cnpj, null, "CNPJ com dígito inválido não entra");
  assert.equal("price" in bax || "unitPrice" in bax, false);
});

test("IA: contato só é confirmado se aparece na página do fornecedor", () => {
  const [bax] = reconcileAiSuppliers(
    { suppliers: [{ name: "Baxmann", website: "baxmann.com.br", phone: "(11) 4000-1234", email: "vendas@baxmann.com.br", cnpj: "00000000000191" }] },
    chunks,
  ).candidates;
  const checked = confirmContacts(bax, "Fale conosco: 11 4000-1234 · CNPJ 00.000.000/0001-91");
  assert.equal(checked.phone.verified, true);
  assert.equal(checked.cnpj.verified, true);
  assert.equal(checked.email.verified, false);
});

test("IA: resposta sem JSON ou sem fontes não gera fornecedor", () => {
  assert.equal(parseJsonLoose("não sei"), null);
  assert.deepEqual(reconcileAiSuppliers(null, chunks).candidates, []);
  assert.deepEqual(reconcileAiSuppliers({ suppliers: [{ name: "Baxmann", website: "baxmann.com.br" }] }, []).candidates, []);
  assert.deepEqual(groundedSources([{ web: { uri: "javascript:alert(1)", title: "x.com" } }]), []);
});

test("IA: prompt leva só dados do produto e pede para não informar preço", () => {
  const prompt = buildResearchPrompt(
    { title: "Ilhós nº 54", brand: "Baxmann", model: "54", manufacturer: null, gtin: "7891234567895", gtinValid: false, packQuantity: 1000, packQuantitySource: "TITULO", searchTerms: [], facts: [] },
    { categoryPath: ["Arte", "Ilhoses"] },
  );
  assert.match(prompt, /Não informe preços/);
  assert.match(prompt, /"marca":"Baxmann"/);
  assert.match(prompt, /"gtin":null/, "GTIN inválido não vai para a pesquisa");
});

test("IA soma à busca web sem duplicar domínio", () => {
  const web = {
    provider: "DESLIGADO", status: "DESLIGADO", message: "desligada", candidates: [], discarded: 0,
    queries: [], manualLinks: [], searchedAt: new Date().toISOString(),
  };
  const research = { status: "OK", message: null, model: "m", webQueries: [], searchEntryPointHtml: null, sources: [], rejected: 0 };
  const [bax] = reconcileAiSuppliers({ suppliers: [{ name: "Baxmann", website: "baxmann.com.br" }] }, chunks).candidates;
  const merged = withAiResearch(web, research, [bax, bax]);
  assert.equal(merged.provider, "IA");
  assert.equal(merged.status, "OK");
  assert.equal(merged.candidates.length, 1);
  assert.equal(merged.message, null);
});

test("leitura de página bloqueia endereços internos", () => {
  for (const url of ["http://baxmann.com.br", "https://127.0.0.1/", "https://localhost/", "https://intranet/", "https://x.internal/", "https://a.com.br:8443/", "https://u:p@a.com.br/"])
    assert.equal(isAllowedPublicUrl(url), false, url);
  assert.equal(isAllowedPublicUrl("https://www.baxmann.com.br/contato"), true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { buildBriefing, unitEconomics, economicsFor } = await loadTs("../lib/pilot/briefing.ts");

const settings = { taxPercent: 4, operatingCost: 1, targetMarginPercent: 20, leadTimeDays: 7, safetyDays: 7, coverageDays: 21 };
const product = (over) => ({ mlItemId: "MLB1", title: "Ilhós 54", thumbnail: null, permalink: "https://produto.mercadolivre.com.br/MLB-1", price: 42.9, stock: 5, status: "active", cost: 18, ...over });
const sales = (id, n, fee = 4.93, ship = 6.85) => Array.from({ length: n }, () => ({ mlItemId: id, quantity: 1, unitPrice: 42.9, saleFee: fee, shippingShare: ship }));

test("conta por unidade usa tarifa e frete realizados e acha o piso da meta", () => {
  const u = unitEconomics({ price: 42.9, cost: 18, feeRate: 4.93 / 42.9, shippingPerUnit: 6.85, taxRate: 0.04, operatingCost: 1 , targetMargin: 0.2 });
  // 42,90 − 4,93 − 1,716 − 6,85 − 1 − 18 = 10,40
  assert.equal(u.profit, 10.4);
  // no piso a margem é exatamente 20%
  const atFloor = unitEconomics({ price: u.floor, cost: 18, feeRate: 4.93 / 42.9, shippingPerUnit: 6.85, taxRate: 0.04, operatingCost: 1, targetMargin: 0.2 });
  assert.ok(Math.abs(atFloor.marginPercent - 20) < 0.05, String(atFloor.marginPercent));
  assert.equal(economicsFor([], 30).feeRate, null);
});

test("reposição aparece quando o estoque acaba antes do prazo do fornecedor, com teto de compra", () => {
  const b = buildBriefing({ products: [product({ stock: 3, cost: 22 })], sales: sales("MLB1", 30), questions: [], settings, historyComplete: true, days: 30 });
  const restock = b.actions.find((a) => a.kind === "RESTOCK");
  assert.ok(restock);
  assert.match(restock.headline, /Acaba em 3 dia\(s\): compre 18 un\. pagando até/);
  assert.equal(b.actions.find((a) => a.kind === "BELOW_FLOOR")?.kind, "BELOW_FLOOR");
});

test("sem histórico completo não sugere reposição nem estoque parado", () => {
  const b = buildBriefing({ products: [product({ stock: 0 }), product({ mlItemId: "MLB2", stock: 9 })], sales: sales("MLB1", 30), questions: [], settings, historyComplete: false, days: 30 });
  assert.equal(b.actions.some((a) => a.kind === "RESTOCK" || a.kind === "IDLE_STOCK"), false);
  assert.ok(b.assumptions.some((t) => /incompleto/.test(t)));
});

test("sem custo não afirma lucro; pede o custo com o valor vendido em jogo", () => {
  const b = buildBriefing({ products: [product({ cost: null })], sales: sales("MLB1", 4), questions: [], settings: { ...settings, taxPercent: null }, historyComplete: true, days: 30 });
  assert.deepEqual(b.actions.map((a) => a.kind), ["ADD_COST"]);
  assert.equal(b.actions[0].stake, 171.6);
  assert.ok(b.assumptions.some((t) => /Imposto não cadastrado/.test(t)));
});

test("prejuízo, estoque parado e perguntas entram ordenados por dinheiro em jogo", () => {
  const b = buildBriefing({
    products: [product({ mlItemId: "MLB9", cost: 40, stock: 50 }), product({ mlItemId: "MLB3", cost: 10, stock: 100 })],
    sales: sales("MLB9", 10),
    questions: [{ id: "q1", itemId: "MLB9", text: "Vende no atacado?", dateCreated: "2026-11-25T10:00:00Z" }],
    settings, historyComplete: true, days: 30, now: new Date("2026-11-25T15:00:00Z"),
  });
  const kinds = b.actions.map((a) => a.kind);
  assert.deepEqual(kinds, ["IDLE_STOCK", "LOSS", "QUESTION"]);
  assert.match(b.actions[2].headline, /há 5 h/);
  assert.ok(b.actions[1].formula.includes("por venda"));
});

const { answerProblems, buildAnswerPrompt, priceGuard } = await loadTs("../lib/pilot/guards.ts");

test("resposta com contato é barrada; resposta limpa passa", () => {
  assert.deepEqual(answerProblems("Olá! Sim, temos 1.000 unidades em estoque. Estamos à disposição."), []);
  assert.ok(answerProblems("Chama no whats (31) 99876-5432").length >= 2);
  assert.ok(answerProblems("veja em www.loja.com.br").some((p) => /link/.test(p)));
  assert.ok(answerProblems("").length);
});

test("prompt usa só os dados do anúncio e proíbe inventar e passar contato", () => {
  const p = buildAnswerPrompt({ question: "Serve no tecido grosso?", title: "Ilhós 54", price: 42.9, stock: 10, attributes: [{ name: "Material", value: "Alumínio" }], previous: [] });
  assert.match(p, /não invente/);
  assert.match(p, /Nunca inclua telefone/);
  assert.match(p, /Material: Alumínio/);
  assert.match(p, /R\$ 42,90/);
});

test("trava de preço: piso, salto, frete grátis e preço sem custo", () => {
  assert.equal(priceGuard({ current: 42.9, proposed: 45.9, floor: 44.1 }), null);
  assert.match(priceGuard({ current: 42.9, proposed: 43.5, floor: 44.1 }), /piso/);
  assert.match(priceGuard({ current: 42.9, proposed: 45.9, floor: null }), /custo/);
  assert.match(priceGuard({ current: 60, proposed: 80, floor: 50 }), /R\$ 79/);
  assert.match(priceGuard({ current: 100, proposed: 160, floor: 50 }), /30%/);
  assert.match(priceGuard({ current: 42.9, proposed: 42.9, floor: 40 }), /já é esse/);
});

test("ações de prejuízo e margem baixa trazem o ajuste de preço para o piso; perguntas trazem a resposta", () => {
  const b = buildBriefing({
    products: [product({ mlItemId: "MLB9", cost: 30, stock: 50 })],
    sales: sales("MLB9", 10),
    questions: [{ id: "123", itemId: "MLB9", text: "Tem preto?", dateCreated: "2026-11-25T10:00:00Z" }],
    settings, historyComplete: true, days: 30, now: new Date("2026-11-25T15:00:00Z"),
  });
  const loss = b.actions.find((a) => a.kind === "LOSS");
  assert.equal(loss.execute.type, "PRICE");
  assert.ok(loss.execute.suggested > loss.execute.current);
  assert.deepEqual(b.actions.find((a) => a.kind === "QUESTION").execute, { type: "ANSWER", questionId: "123", question: "Tem preto?" });
});

test("sem botão de preço quando o piso pede um salto que a trava recusaria", () => {
  const b = buildBriefing({ products: [product({ mlItemId: "MLB9", cost: 40, stock: 50 })], sales: sales("MLB9", 10), questions: [], settings, historyComplete: true, days: 30 });
  const loss = b.actions.find((a) => a.kind === "LOSS");
  assert.ok(loss);
  assert.equal(loss.execute, undefined);
});

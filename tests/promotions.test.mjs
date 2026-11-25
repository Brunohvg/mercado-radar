import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { evaluateInvite, joinBody, sortInvites } = await loadTs("../lib/promotions/evaluate.ts");
const ctx = { cost: 40, feeRate: 0.12, shippingPerUnit: 20, taxPercent: 4, operatingCost: 1, targetMarginPercent: 20 };
const invite = (over) => ({ promotionId: "P-1", promotionType: "DEAL", promotionName: "Black Friday", deadline: null, finishDate: null, mlItemId: "MLB1", title: "Kit", status: "candidate", currentPrice: 100, dealPrice: 90, sellerPercent: null, meliPercent: null, offerId: null, ...over });

test("campanha sem co-participação: recebe o preço da promoção e paga o frete acima de R$ 79", () => {
  const r = evaluateInvite(invite({}), ctx);
  assert.equal(r.received, 90);
  assert.equal(r.profit, 14.6);
  assert.equal(r.verdict, "APERTADO");
  assert.equal(r.discountPercent, 10);
  assert.match(r.formula, /frete R\$\s20,00/);
});

test("quando o ML banca parte, conta só a sua parte do desconto", () => {
  const r = evaluateInvite(invite({ promotionType: "SMART", dealPrice: 85, sellerPercent: 5, meliPercent: 10, offerId: "OFF-1" }), { ...ctx, cost: 30 });
  assert.equal(r.received, 95);
  assert.equal(r.profit, 28.8);
  assert.equal(r.verdict, "ACEITAR");
  assert.deepEqual(joinBody(r), { promotion_id: "P-1", promotion_type: "SMART", offer_id: "OFF-1" });
});

test("abaixo de R$ 79 o comprador paga o frete; prejuízo e falta de custo têm veredito próprio", () => {
  const cheap = evaluateInvite(invite({ currentPrice: 80, dealPrice: 70 }), { ...ctx, cost: 60 });
  assert.match(cheap.formula, /comprador paga/);
  assert.equal(cheap.verdict, "RECUSAR");
  const none = evaluateInvite(invite({}), { ...ctx, cost: null });
  assert.equal(none.verdict, "SEM_DADOS");
  assert.deepEqual(none.missing, ["custo do produto"]);
  assert.deepEqual(joinBody(invite({})), { promotion_id: "P-1", promotion_type: "DEAL", deal_price: 90 });
  const sorted = sortInvites([cheap, none, evaluateInvite(invite({}), { ...ctx, cost: 20 })]);
  assert.deepEqual(sorted.map((s) => s.verdict), ["ACEITAR", "SEM_DADOS", "RECUSAR"]);
});

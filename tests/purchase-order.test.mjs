import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { buildPurchaseOrders, orderMessage } = await loadTs("../lib/purchase-order.ts");
const settings = { leadTimeDays: 7, safetyDays: 7, coverageDays: 21 };
const p = (id, stock, cost, supplier) => ({ mlItemId: id, title: "Produto " + id, stock, cost, supplier, status: "active" });

test("repõe só o que não cobre entrega + segurança, agrupado por fornecedor", () => {
  const orders = buildPurchaseOrders({
    products: [p("A", 5, 8, "Atacado BH"), p("B", 100, 8, "Atacado BH"), p("C", 2, null, "Outro"), p("D", 0, 10, null)],
    unitsSold: { A: 30, B: 30, C: 6 },
    days: 30,
    settings,
    suppliers: [{ id: "s1", name: "Atacado BH", leadTimeDays: 3, minOrderValue: 300, minOrderUnits: null, phone: "(31) 3222-1234", email: null, contactName: "Ana" }],
  });
  const bh = orders.find((o) => o.name === "Atacado BH");
  assert.deepEqual(bh.lines.map((l) => l.mlItemId), ["A"]);
  assert.equal(bh.lines[0].quantity, 16); // 1/dia × 21 dias − 5
  assert.equal(bh.total, 128);
  assert.equal(bh.minOrderGap, 172);
  assert.equal(bh.lines[0].urgent, false); // 5 dias > 3 de entrega
  const outro = orders.find((o) => o.name === "Outro");
  assert.equal(outro.registered, false);
  assert.equal(outro.missingCost, 1);
  assert.equal(orders.some((o) => o.lines.some((l) => l.mlItemId === "D")), false); // sem venda, sem compra
});

test("mensagem lista itens e só fala de valor quando todos têm custo", () => {
  const m = orderMessage({ name: "X", contact: { name: "Ana" } }, [{ title: "Kit", quantity: 10, unitCost: 2 }]);
  assert.match(m, /Olá, Ana!/);
  assert.match(m, /10 un\. — Kit/);
  assert.match(m, /R\$\s20,00/);
  assert.doesNotMatch(orderMessage({ name: "X", contact: null }, [{ title: "Kit", quantity: 1, unitCost: null }]), /R\$/);
});

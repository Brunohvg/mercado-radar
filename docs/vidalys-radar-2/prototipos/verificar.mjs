import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Valida as ilustrações financeiras e a geração de HTML. Não substitui QA de browser.
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const context = vm.createContext({});
vm.runInContext(script.slice(0, script.indexOf('document.addEventListener')), context);
const baseline = { ...context.demo };
const result = context.calculate(baseline);
assert.equal(result.ready, true);
assert.equal(result.landed, 45);
assert.equal(result.contribution, 24);
assert.equal(result.capital, 500);
assert.equal(result.ceiling, 49);
assert.equal(result.floor, 93.75);
assert.equal(result.lotContribution, 240);
assert.ok(Math.abs(result.roi - 51.06382978723404) < 1e-9);

assert.equal(context.calculate({ ...baseline, freight: null }).ready, false);
assert.equal(context.calculate({ ...baseline, freight: 0 }).ready, true);
assert.equal(context.calculate({ ...baseline, purchase: 78 }).contribution, -12);
assert.equal(context.calculate({ ...baseline, quantity: 1.5 }).ready, false);
assert.equal(context.calculate({ ...baseline, quantity: 0 }).ready, false);
assert.equal(context.calculate({ ...baseline, shipping: -1 }).ready, false);
assert.equal(context.calculate({ ...baseline, commission: 96 }).ready, false);
assert.equal(context.calculate({ ...baseline, margin: null }).ready, false);
assert.equal(context.calculate({ ...baseline, roi: null }).ready, false);
assert.equal(context.parseValue(''), null);
assert.equal(context.parseValue('0'), 0);
assert.equal(context.parseValue('1.234,56'), 1234.56);
assert.equal(context.parseValue('inválido'), null);

const joint = context.calculate({
  ...baseline, purchase: 52, quantity: 1, freight: 0, ads: 0, roi: 100,
});
assert.equal(joint.ceiling, 35);
assert.equal(joint.limiting, 'ROI');
const bounded = context.calculate({
  ...baseline, purchase: 35, quantity: 1, freight: 0, ads: 0, roi: 100,
});
assert.equal(bounded.roi, 100);
assert.ok(bounded.margin >= 20);

for (const [screen] of context.views) {
  context.state.screen = screen;
  const output = context[screen]();
  assert.ok(output.includes('<'), `HTML ausente: ${screen}`);
  assert.ok(!output.includes('undefined'), `Valor indefinido: ${screen}`);
}
context.state.screen = 'simulator';
context.state.scenario = 'missing';
assert.ok(context.simulator().includes('Dados insuficientes'));
context.state.scenario = 'loss';
assert.ok(context.simulator().includes('-R$'));
context.state.query = 'sem-correspondencia';
assert.ok(context.productRows().includes('Nenhum exemplo'));
assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/.test(script));
assert.ok(!html.includes('__FONT__'));
console.log('Aprovado: sintaxe JS, 11 geradores de vistas, estados financeiros, metas conjuntas e ausência de chamadas de rede. QA interativo e responsivo permanece pendente.');

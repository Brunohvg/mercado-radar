import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { reportedSold, apiSold, salesVelocity, VALIDATED_COUNTER } = await loadTs("../lib/competitor-sales-velocity.ts");
const input = { sold: 1000, lowerBound: true, dateCreated: "2026-01-01T00:00:00Z", observedAt: "2026-04-01T00:00:00Z" };
const reading = (date, soldQuantity, extra = {}) => ({ capturedAt: date, soldQuantity, soldKnown: true, soldIsLowerBound: false, trackingMode: VALIDATED_COUNTER, ...extra });
test("missing counters are not zero", () => {
  for (const value of [null, undefined, "", -1, 1.2, NaN]) assert.equal(reportedSold(value), null);
  assert.equal(apiSold({body:{}}), null);
  assert.equal(apiSold({body:{sold_quantity:0}}), 0);
});
test("lifetime is explicitly a minimum when source is a lower bound", () => {
  assert.equal(salesVelocity(input).lifetime, 333.3);
  assert.equal(salesVelocity(input).lifetimeIsMinimum, true);
  assert.equal(salesVelocity({...input,dateCreated:null}).lifetime,null);
  assert.equal(salesVelocity({...input,dateCreated:"2026-05-01"}).lifetime,null);
  assert.equal(salesVelocity({...input,sold:0,lowerBound:false}).lifetime,0);
});
test("recent rate uses dated, validated, monotonic counters only", () => {
  const a=reading("2026-03-25T00:00:00Z",100), b=reading("2026-04-01T00:00:00Z",121);
  assert.equal(salesVelocity({...input,readings:[a,b]}).recent,90);
  for (const bad of [{...a,trackingMode:"API"},{...a,soldKnown:false},{...a,soldIsLowerBound:true},{...a,soldQuantity:150}]) {
    assert.equal(salesVelocity({...input,readings:[bad,b]}).recent,null);
  }
});
test("rolls and stems are explicit pack quantities", async () => {
  const { kitQuantity } = await loadTs("../lib/competitor-analysis.ts");
  assert.equal(kitQuantity("Arame nº22 50 hastes 40 cm").quantity,50);
  assert.equal(kitQuantity("Arame nº26 2 rolos 10 m").quantity,2);
});

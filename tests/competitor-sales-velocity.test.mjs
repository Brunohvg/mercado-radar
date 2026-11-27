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

test("legacy Momentum stays compatible without admitting old snapshots into new velocity", async () => {
 const { momentumEligible } = await loadTs("../lib/competitor-sales-velocity.ts");
 const old = reading("2026-03-25T00:00:00Z",100,{trackingMode:"API"});
 assert.equal(momentumEligible(old),true);
 assert.equal(momentumEligible({...old,soldKnown:false}),false);
 assert.equal(salesVelocity({...input,readings:[old,reading("2026-04-01T00:00:00Z",120)]}).recent,null);
});
test("missing counters preserve prior demand and duplicate snapshots are suppressed", async () => {
 const { demandEvidence, snapshotDue } = await loadTs("../lib/competitor-sales-velocity.ts");
 assert.equal(demandEvidence(null,20,80),80);
 assert.equal(demandEvidence(null,"BAIXA",null),null);
 assert.equal(demandEvidence(0,20,80),20);
 const prev={...reading("2026-04-01T00:00:00Z",120),price:29.9,visits:500};
 assert.equal(snapshotDue(prev,prev,new Date("2026-04-01T01:00:00Z")),false);
 assert.equal(snapshotDue(prev,{...prev,soldKnown:false},new Date("2026-04-01T01:00:00Z")),true);
 assert.equal(snapshotDue(prev,prev,new Date("2026-04-01T06:00:00Z")),true);
});
test("recent history is dated separately from saved page and reset blocks rate", () => {
 const a=reading("2026-03-25T00:00:00Z",100), b=reading("2026-04-01T00:00:00Z",121);
 assert.equal(salesVelocity({...input,observedAt:"2026-03-26T00:00:00Z",now:"2026-04-01T00:00:00Z",readings:[a,b]}).recent,90);
 assert.equal(salesVelocity({...input,sold:100,lowerBound:false,readings:[a,b]}).recent,null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDeliveries } from "./deliveries.mjs";

test("sums distinct deliveries in integer cents", () => {
  assert.deepEqual(summarizeDeliveries([{id:"a",amountCents:3500},{id:"b",amountCents:4500}]),{ids:["a","b"],totalCents:8000});
});
test("rejects invalid money", () => {
  assert.throws(()=>summarizeDeliveries([{id:"bad",amountCents:-1}]),RangeError);
});

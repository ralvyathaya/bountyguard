import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDeliveries } from "./deliveries.mjs";

test("sums distinct deliveries in integer cents", () => {
  assert.deepEqual(summarizeDeliveries([{id:"a",amountCents:3500},{id:"b",amountCents:4500}]),{ids:["a","b"],totalCents:8000});
});
test("deduplicates identical replays while retaining first-seen order", () => {
  assert.deepEqual(summarizeDeliveries([{id:"a",amountCents:3500},{id:"a",amountCents:3500},{id:"b",amountCents:4500}]),{ids:["a","b"],totalCents:8000});
});
test("rejects a conflicting amount on a repeated delivery ID", () => {
  assert.throws(()=>summarizeDeliveries([{id:"a",amountCents:3500},{id:"a",amountCents:4500}]),RangeError);
});
test("rejects empty and whitespace-only IDs", () => {
  for(const id of [""," "]) assert.throws(()=>summarizeDeliveries([{id,amountCents:0}]),TypeError);
});
test("rejects negative, fractional and unsafe money", () => {
  for(const amountCents of [-1,0.1,NaN,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>summarizeDeliveries([{id:"bad",amountCents}]),RangeError);
});
test("accepts zero amounts and an empty batch", () => {
  assert.deepEqual(summarizeDeliveries([{id:"zero",amountCents:0}]),{ids:["zero"],totalCents:0});
  assert.deepEqual(summarizeDeliveries([]),{ids:[],totalCents:0});
});
test("rejects an overflowing total", () => {
  assert.throws(()=>summarizeDeliveries([{id:"a",amountCents:Number.MAX_SAFE_INTEGER},{id:"b",amountCents:1}]),RangeError);
});

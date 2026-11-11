import test from "node:test";
import assert from "node:assert/strict";
import { reportStateSchema } from "../lib/studio-report";
test("reports preserve valid Studio layout but reject executable or embedded data widgets",()=>{
  assert.ok(reportStateSchema.safeParse({pages:[{id:"operations",widgets:{one:{type:"decision-path",dataMapping:{bounty:[{id:"bounties.id"}]}},two:{type:"grid"}},widgetLayout:{}}]}).success);
  assert.equal(reportStateSchema.safeParse({pages:[{id:"bad",widgets:{one:{type:"custom-javascript"}}}]}).success,false);
  assert.equal(reportStateSchema.safeParse({pages:[{id:"bad",widgets:{},rows:[{secret:"hidden"}]}]}).success,false);
});

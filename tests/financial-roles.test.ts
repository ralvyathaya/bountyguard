import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../lib/auth";
import { POST as create } from "../app/api/bounties/route";
import { POST as submit } from "../app/api/bounties/[id]/submissions/route";
import { POST as audit } from "../app/api/agent/audit/route";
import { POST as order } from "../app/api/paypal/orders/route";
import { POST as capture } from "../app/api/paypal/orders/[orderId]/capture/route";
import { POST as payout } from "../app/api/paypal/payout/route";
import { POST as sync } from "../app/api/paypal/payout/[id]/sync/route";
import { PUT as save } from "../app/api/studio/report/route";
process.env.SESSION_SECRET="financial-role-tests-secret-with-more-than-32-characters";
for(const [name,handler] of Object.entries({create,submit,audit,order,capture,payout,sync,save})){
  test(`judge cannot call ${name}, before input validation or database writes`,async()=>{
    const request=new Request("https://bountyguard.example/api/test",{method:"POST",headers:{origin:"https://bountyguard.example","content-type":"application/json",cookie:`bountyguard_session=${createSession(Date.now(),"judge")}`},body:"{}"});
    const response=await handler(request,{params:Promise.resolve({id:"fixture",orderId:"fixture"})});
    assert.equal(response.status,403);
    assert.equal((await response.json()).code,"FORBIDDEN");
  });
}

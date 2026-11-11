import { api, readBody } from "@/lib/api";
import { bountySchema, idSchema } from "@/lib/validation";
import { createBounty } from "@/lib/bounty-service";
import { listLedger, redactLedgerRow, ledgerInclude, toLedgerRow } from "@/lib/ledger";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
export const runtime = "nodejs";
export const GET = api(async (request) => {
  const {role} = requireViewer(request);
  const id=new URL(request.url).searchParams.get("id");
  if(id){
    const bounty=await db().bounty.findUnique({where:{id:idSchema.parse(id)},include:ledgerInclude});
    if(!bounty)throw new AppError(404,"Bounty not found.");
    return {rows:[redactLedgerRow(toLedgerRow(bounty),role)]};
  }
  return {rows:(await listLedger()).map(row => redactLedgerRow(row, role))};
}, "viewer");
export const POST = api(async (request) => ({
  bounty: await createBounty(await readBody(request, bountySchema)),
}));

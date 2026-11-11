import { api } from "@/lib/api";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { ledgerInclude, toLedgerRow, redactLedgerRow } from "@/lib/ledger";
import { idSchema } from "@/lib/validation";
export const runtime = "nodejs";
export const GET = api(async (request) => {
  const id = idSchema.parse(new URL(request.url).pathname.split("/").at(-1));
  const bounty = await db().bounty.findUnique({where:{id},include:ledgerInclude});
  if (!bounty) throw new AppError(404,"Bounty not found.");
  const row=redactLedgerRow(toLedgerRow(bounty),requireViewer(request).role);
  return new Response(JSON.stringify({format:"bountyguard-audit-packet/v1",exportedAt:new Date().toISOString(),environment:"PAYPAL_SANDBOX",notice:"Provider-linked decision records. This packet is not a cryptographic attestation.",bounty:row},null,2),{headers:{"Content-Type":"application/json","Content-Disposition":`attachment; filename="bountyguard-${id}.json"`}});
},"viewer");

import { api, readBody } from "@/lib/api";
import { payoutInputSchema } from "@/lib/validation";
import { settleBounty } from "@/lib/bounty-service";
export const runtime = "nodejs";
export const POST = api(async (request) => {
  const input = await readBody(request, payoutInputSchema);
  return {
    payout: await settleBounty(input.bountyId, input.submissionId, true),
  };
});

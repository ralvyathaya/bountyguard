import { api, readBody } from "@/lib/api";
import { bountySchema } from "@/lib/validation";
import { createBounty } from "@/lib/bounty-service";
import { listLedger } from "@/lib/ledger";
export const runtime = "nodejs";
export const GET = api(async () => ({ rows: await listLedger() }));
export const POST = api(async (request) => ({
  bounty: await createBounty(await readBody(request, bountySchema)),
}));

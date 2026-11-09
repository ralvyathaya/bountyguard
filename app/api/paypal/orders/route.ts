import { api, readBody } from "@/lib/api";
import { bountyIdSchema } from "@/lib/validation";
import { fundOrder } from "@/lib/bounty-service";
export const runtime = "nodejs";
export const POST = api(async (request) =>
  fundOrder((await readBody(request, bountyIdSchema)).bountyId),
);

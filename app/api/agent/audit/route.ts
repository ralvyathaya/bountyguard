import { api, readBody } from "@/lib/api";
import { auditInputSchema } from "@/lib/validation";
import { runAudit } from "@/lib/bounty-service";
export const runtime = "nodejs";
export const maxDuration = 120;
export const POST = api(async (request) => ({
  verdict: await runAudit(
    (await readBody(request, auditInputSchema)).submissionId,
  ),
}));

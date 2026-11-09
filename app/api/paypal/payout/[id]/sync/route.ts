import { api } from "@/lib/api";
import { idSchema } from "@/lib/validation";
import { syncPayout } from "@/lib/bounty-service";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => ({
    payout: await syncPayout(idSchema.parse((await context.params).id)),
  }))(request);
}

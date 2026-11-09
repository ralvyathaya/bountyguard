import { api } from "@/lib/api";
import { idSchema } from "@/lib/validation";
import { captureFunding } from "@/lib/bounty-service";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  return api(async () =>
    captureFunding(idSchema.parse((await context.params).orderId)),
  )(request);
}

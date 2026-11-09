import { api, readBody } from "@/lib/api";
import { idSchema, submissionSchema } from "@/lib/validation";
import { submitBounty } from "@/lib/bounty-service";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async (request) =>
    submitBounty(
      idSchema.parse((await context.params).id),
      await readBody(request, submissionSchema),
    ),
  )(request);
}

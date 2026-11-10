import { z } from "zod";
import { AppError } from "./errors";
import { checkOrigin, requireMaintainer, requireViewer } from "./auth";

export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError(415, "Use application/json.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 131072) {
      await reader.cancel();
      throw new AppError(413, "Request exceeds 128 KiB.");
    }
    chunks.push(value);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "Invalid JSON body.");
  }
  return schema.parse(parsed);
}
export function api(
  handler: (request: Request) => Promise<Response | unknown>,
  authenticated: boolean | "viewer" = true,
) {
  return async (request: Request): Promise<Response> => {
    try {
      if (!["GET", "HEAD"].includes(request.method)) checkOrigin(request);
      if (authenticated === "viewer") requireViewer(request);
      else if (authenticated) requireMaintainer(request);
      const result = await handler(request);
      const response =
        result instanceof Response ? result : Response.json(result);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      if (error instanceof z.ZodError)
        return Response.json(
          {
            error: error.issues.map((v) => v.message).join(" "),
            code: "VALIDATION_ERROR",
          },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      if (error instanceof AppError)
        return Response.json(
          { error: error.message, code: error.code },
          { status: error.status, headers: { "Cache-Control": "no-store" } },
        );
      console.error(
        "BountyGuard operation failed:",
        error instanceof Error ? error.name : "UnknownError",
      );
      return Response.json(
        {
          error:
            "The operation could not be completed. Check database connectivity and server configuration.",
          code: "SERVER_ERROR",
        },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}

import { z } from "zod";
import { api, readBody } from "@/lib/api";
import { login } from "@/lib/auth";
export const runtime = "nodejs";
export const POST = api(async (request) => {
  const { password } = await readBody(
    request,
    z.object({ password: z.string().min(1).max(1024) }).strict(),
  );
  return Response.json(
    { authenticated: true },
      { headers: { "Set-Cookie": await login(password) } },
  );
}, false);

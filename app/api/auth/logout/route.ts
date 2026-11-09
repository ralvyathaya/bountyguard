import { api } from "@/lib/api";
import { sessionCookie } from "@/lib/auth";
export const POST = api(
  async () =>
    Response.json(
      { authenticated: false },
      { headers: { "Set-Cookie": sessionCookie("", true) } },
    ),
  false,
);

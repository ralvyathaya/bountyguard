import { api } from "@/lib/api";
import { getSession } from "@/lib/auth";
export const GET = api(
  async (request) => ({ authenticated: !!getSession(request), role: getSession(request)?.role ?? null }),
  false,
);

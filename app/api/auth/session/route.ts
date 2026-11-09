import { api } from "@/lib/api";
import { hasSession } from "@/lib/auth";
export const GET = api(
  async (request) => ({ authenticated: hasSession(request) }),
  false,
);

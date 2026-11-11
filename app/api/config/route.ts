import { api } from "@/lib/api";
import { sandboxBaseUrl } from "@/lib/paypal";
import { requireViewer } from "@/lib/auth";
export const GET = api(async (request) => {
  sandboxBaseUrl();
  return {
    paypalClientId: requireViewer(request).role === "maintainer" ? process.env.PAYPAL_CLIENT_ID || null : null,
    judgeAvailable: !!process.env.JUDGE_PASSWORD,
    missing: [
      "DATABASE_URL",
      "PAYPAL_CLIENT_ID",
      "PAYPAL_CLIENT_SECRET",
      "OPENAI_API_KEY",
      "OPENAI_BASE_URL",
      "OPENAI_MODEL",
    ].filter((key) => !process.env[key]),
  };
}, "viewer");

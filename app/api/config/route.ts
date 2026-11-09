import { api } from "@/lib/api";
import { sandboxBaseUrl } from "@/lib/paypal";
export const GET = api(async () => {
  sandboxBaseUrl();
  return {
    paypalClientId: process.env.PAYPAL_CLIENT_ID || null,
    missing: [
      "DATABASE_URL",
      "PAYPAL_CLIENT_ID",
      "PAYPAL_CLIENT_SECRET",
      "OPENAI_API_KEY",
      "OPENAI_BASE_URL",
      "OPENAI_MODEL",
    ].filter((key) => !process.env[key]),
  };
});

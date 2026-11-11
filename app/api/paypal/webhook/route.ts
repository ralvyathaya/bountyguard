import { handlePayPalWebhook } from "@/lib/paypal-webhook";

export const runtime = "nodejs";
export const maxDuration = 120;
export const POST = handlePayPalWebhook;

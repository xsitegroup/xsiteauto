import { createHmac, timingSafeEqual } from "node:crypto";

// A thin Stripe client over its REST API (no SDK needed). Needs STRIPE_SECRET_KEY.
export const stripeReady = () => !!process.env.STRIPE_SECRET_KEY;

function encode(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") encode(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}

export async function stripe(path, params = {}, method = "POST") {
  const body = method === "GET" ? undefined : new URLSearchParams(encode(params));
  const r = await fetch(`https://api.stripe.com/v1/${path}${method === "GET" && Object.keys(params).length ? "?" + new URLSearchParams(encode(params)) : ""}`, {
    method, body,
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}), "stripe-version": "2024-06-20" },
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`stripe ${path}: ${d.error?.message || r.status}`);
  return d;
}

// Checks the Stripe-Signature header (STRIPE_WEBHOOK_SECRET). Returns the event, or null if it isn't from Stripe.
export function verifyWebhook(payload, header, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  if (!secret || !header) return null;
  const parts = Object.fromEntries(String(header).split(",").map((p) => p.split("=")).filter((p) => p.length === 2 && p[0] === "t").map(([k, v]) => [k, v]));
  const sigs = String(header).split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = +parts.t;
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return null;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"));
  if (!sigs.some((s) => { const b = Buffer.from(s); return b.length === want.length && timingSafeEqual(b, want); })) return null;
  try { return JSON.parse(payload); } catch { return null; }
}

// What XSite Auto costs, in US cents. STRIPE_PRICE_MONTHLY / STRIPE_PRICE_SETUP can point at prices made in Stripe instead.
export const MONTHLY_CENTS = 9900, SETUP_CENTS = 49500;

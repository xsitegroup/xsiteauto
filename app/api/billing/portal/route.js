import { NextResponse } from "next/server";
import { signedIn } from "@/lib/guard";
import { stripe, stripeReady } from "@/lib/stripe";
import { shopAppUrl } from "@/lib/shop";

// Update the card, see invoices or cancel, on Stripe's own billing page.
export async function POST() {
  const g = await signedIn({ owner: true });
  if (g.error) return g.error;
  if (!stripeReady() || !g.shop.stripe_customer_id) return NextResponse.json({ error: "There's no billing account yet." }, { status: 404 });
  try {
    const s = await stripe("billing_portal/sessions", { customer: g.shop.stripe_customer_id, return_url: `${await shopAppUrl(g.shop)}/#billing` });
    return NextResponse.json({ url: s.url });
  } catch (e) {
    console.error(e.message);
    return NextResponse.json({ error: "We couldn't open the billing page. Try again in a minute." }, { status: 502 });
  }
}

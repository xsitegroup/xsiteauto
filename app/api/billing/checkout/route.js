import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { signedIn } from "@/lib/guard";
import { stripe, stripeReady, PRICES, currencyFor } from "@/lib/stripe";
import { forgetShop, shopAppUrl } from "@/lib/shop";

// "Keep XSite Auto": opens Stripe Checkout for $99/month, plus the optional $495 Done-for-you setup
// when the owner ticks it. An active shop can also buy Done-for-you setup on its own later ({ setupOnly: true }).
export async function POST(req) {
  const g = await signedIn({ owner: true });
  if (g.error) return g.error;
  if (!stripeReady()) return NextResponse.json({ error: "Online payment isn't switched on yet. Call XSite at 905.346.0864 and we'll set you up." }, { status: 503 });
  const shop = g.shop;
  const body = await req.json().catch(() => ({}));
  const setupOnly = body.setupOnly === true;
  const wantSetup = (body.setup === true || setupOnly) && !shop.setup_paid_at;
  if (setupOnly && shop.setup_paid_at) return NextResponse.json({ error: "Done-for-you setup is already paid for. Call 905.346.0864 to book your session." }, { status: 409 });
  if (setupOnly && shop.status !== "active") return NextResponse.json({ error: "Keep XSite Auto first, and tick Done-for-you setup there." }, { status: 409 });
  if (!setupOnly && shop.status === "active") return NextResponse.json({ error: "XSite Auto is already active for this shop." }, { status: 409 });
  try {
    let customer = shop.stripe_customer_id;
    if (!customer) {
      const c = await stripe("customers", { email: g.user.email, name: shop.name, phone: shop.phone || undefined, metadata: { shop_id: shop.id, slug: shop.slug } });
      customer = c.id;
      await query("update shops set stripe_customer_id = $2 where id = $1", [shop.id, customer]);
      forgetShop();
    }
    const base = await shopAppUrl(shop);
    const cur = currencyFor(shop), C = cur.toUpperCase();
    const monthlyPrice = process.env[`STRIPE_PRICE_MONTHLY_${C}`], setupPrice = process.env[`STRIPE_PRICE_SETUP_${C}`];
    const monthly = monthlyPrice ? { price: monthlyPrice, quantity: 1 }
      : { price_data: { currency: cur, unit_amount: PRICES[cur].monthly, recurring: { interval: "month" }, product_data: { name: "XSite Auto monthly" } }, quantity: 1 };
    const setup = setupPrice ? { price: setupPrice, quantity: 1 }
      : { price_data: { currency: cur, unit_amount: PRICES[cur].setup, product_data: { name: "XSite Auto Done-for-you setup", description: "QuickBooks import, booking on your website and Google, rates and technicians, team training and a first-week check-in" } }, quantity: 1 };
    const tax = process.env.STRIPE_TAX === "on";
    const session = await stripe("checkout/sessions", setupOnly ? {
      mode: "payment", customer, client_reference_id: shop.id,
      line_items: [setup],
      metadata: { shop_id: shop.id, setup: "1", kind: "setup" }, payment_intent_data: { metadata: { shop_id: shop.id, kind: "setup" } },
      success_url: `${base}/#billing?setup=1`, cancel_url: `${base}/#billing`,
      ...(tax ? { automatic_tax: { enabled: true }, customer_update: { address: "auto", name: "auto" }, billing_address_collection: "required" } : {}),
    } : {
      mode: "subscription", customer, client_reference_id: shop.id,
      line_items: wantSetup ? [monthly, setup] : [monthly],
      metadata: { shop_id: shop.id, setup: wantSetup ? "1" : "0" }, subscription_data: { metadata: { shop_id: shop.id } },
      success_url: `${base}/#billing?paid=1`, cancel_url: `${base}/#billing`,
      allow_promotion_codes: true,
      ...(tax ? { automatic_tax: { enabled: true }, customer_update: { address: "auto", name: "auto" }, billing_address_collection: "required" } : {}),
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error(e.message);
    return NextResponse.json({ error: "We couldn't open the payment page. Try again in a minute, or call 905.346.0864." }, { status: 502 });
  }
}

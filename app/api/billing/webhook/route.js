import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyWebhook } from "@/lib/stripe";
import { forgetShop, shopById } from "@/lib/shop";
import { notifyXSite } from "@/lib/xsite";
import { sendSystem } from "@/lib/system-mail";

// Stripe tells us about payments here (endpoint: https://app.xsiteauto.com/api/billing/webhook).
async function shopFor(obj) {
  const id = obj?.metadata?.shop_id || obj?.client_reference_id;
  if (id) return shopById(id);
  const cust = obj?.customer;
  if (!cust) return null;
  const { rows } = await query("select id from shops where stripe_customer_id = $1", [cust]);
  return rows[0] ? shopById(rows[0].id) : null;
}
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const set = async (id, sql, params = []) => { await query(`update shops set ${sql} where id = $1`, [id, ...params]); forgetShop(); };

export async function POST(req) {
  const payload = await req.text();
  const ev = verifyWebhook(payload, req.headers.get("stripe-signature"));
  if (!ev) return NextResponse.json({ error: "bad signature" }, { status: 400 });
  const o = ev.data?.object || {};
  const shop = await shopFor(o);
  if (!shop) return NextResponse.json({ ok: true, ignored: true });

  switch (ev.type) {
    case "checkout.session.completed": {
      if (o.payment_status && o.payment_status !== "paid" && o.payment_status !== "no_payment_required") break;
      const owner = (await query("select email, name from users where shop_id = $1 and role = 'owner' order by id limit 1", [shop.id])).rows[0];
      const money = `$${((o.amount_total || 0) / 100).toFixed(2)} ${String(o.currency || "usd").toUpperCase()}`;
      const call = process.env.SETUP_CALL_URL ? [["Book a time", process.env.SETUP_CALL_URL]] : [];

      // Done-for-you setup bought on its own, after the shop was already paying.
      if (o.mode === "payment" && o.metadata?.kind === "setup") {
        if (shop.setup_paid_at) break;
        await set(shop.id, "setup_paid_at = now()");
        await Promise.allSettled([
          notifyXSite("setup_purchased", { subject: `XSite Auto Done-for-you setup: ${shop.name}`, heading: "Done-for-you setup bought", intro: `${shop.name} bought Done-for-you setup. Book their session.`,
            rows: [["Shop", shop.name], ["Owner", `${owner?.name || ""} ${owner?.email || ""}`], ["Phone", shop.phone || ""], ["Amount", money]],
            data: { shop: { id: shop.id, slug: shop.slug, name: shop.name }, amountTotal: o.amount_total, currency: o.currency } }),
          owner && sendSystem({ to: owner.email, subject: "Your Done-for-you setup",
            heading: "Thanks, we'll take it from here", intro: `We'll be in touch within one business day to book ${esc(shop.name)}'s setup session: your QuickBooks import, booking on your website and Google, your rates and technicians, and training for your team.`,
            buttons: call, footer: "Questions? Call 905.346.0864." }),
        ]);
        break;
      }

      const first = !shop.converted_at;
      const withSetup = o.metadata?.setup === "1";
      await set(shop.id, `status = 'active', stripe_customer_id = coalesce($2, stripe_customer_id), stripe_subscription_id = coalesce($3, stripe_subscription_id),
        converted_at = coalesce(converted_at, now()), ${withSetup ? "setup_paid_at = coalesce(setup_paid_at, now())," : ""} past_due_since = null, read_only_since = null`, [o.customer || null, o.subscription || null]);
      if (first) {
        await Promise.allSettled([
          notifyXSite("trial_converted", { subject: `XSite Auto sale: ${shop.name}${withSetup ? " (with Done-for-you setup)" : ""}`, heading: "Trial converted",
            intro: withSetup ? `${shop.name} kept XSite Auto and bought Done-for-you setup. Book their setup session.` : `${shop.name} kept XSite Auto. Book their free welcome call.`,
            rows: [["Shop", shop.name], ["Owner", `${owner?.name || ""} ${owner?.email || ""}`], ["Phone", shop.phone || ""], ["Done-for-you setup", withSetup ? "Yes" : "No"], ["Amount", money]],
            data: { shop: { id: shop.id, slug: shop.slug, name: shop.name }, amountTotal: o.amount_total, currency: o.currency, setup: withSetup } }),
          owner && sendSystem({ to: owner.email, subject: "You're all set with XSite Auto",
            heading: "Thanks for keeping XSite Auto",
            intro: withSetup
              ? `Everything you set up during the trial carries straight on. We'll be in touch within one business day to book ${esc(shop.name)}'s Done-for-you setup session.`
              : `Everything you set up during the trial carries straight on. Every new shop gets a free 20-minute welcome call: we'll check your setup and answer any questions. We'll reach out to book it, or pick a time yourself.`,
            buttons: call, footer: "Questions? Call 905.346.0864." }),
        ]);
      }
      break;
    }
    case "invoice.paid":
      if (shop.status === "past_due" || (shop.status === "read_only" && shop.converted_at)) await set(shop.id, "status = 'active', past_due_since = null, read_only_since = null");
      break;
    case "invoice.payment_failed":
      if (shop.status === "active") await set(shop.id, "status = 'past_due', past_due_since = coalesce(past_due_since, now())");
      break;
    case "customer.subscription.updated":
      if (o.status === "active" && shop.status !== "active" && shop.converted_at) await set(shop.id, "status = 'active', past_due_since = null, read_only_since = null");
      if ((o.status === "past_due" || o.status === "unpaid") && shop.status === "active") await set(shop.id, "status = 'past_due', past_due_since = coalesce(past_due_since, now())");
      break;
    case "customer.subscription.deleted":
      if (shop.status !== "read_only" && shop.status !== "closed") {
        await set(shop.id, "status = 'read_only', read_only_since = now()");
        await notifyXSite("subscription_cancelled", { subject: `XSite Auto cancelled: ${shop.name}`, heading: "Subscription ended", intro: `${shop.name}'s subscription has ended. The account is now read-only.`, rows: [["Shop", shop.name], ["Phone", shop.phone || ""]], data: { shop: { id: shop.id, slug: shop.slug, name: shop.name } } });
      }
      break;
  }
  return NextResponse.json({ ok: true });
}

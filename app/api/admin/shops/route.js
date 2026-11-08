import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { isSuper } from "@/lib/admin";
import { asSystem } from "@/lib/db";
import { shopState, daysLeft, bookingUrl } from "@/lib/shop";
import { PRICES } from "@/lib/stripe";

// Every shop, for XSite staff only: who signed up, where, how far along, and whether they pay.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user || !isSuper(user.email)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rows = await asSystem(async (q) => (await q(`
    select s.*,
      site.data->>'street' as street, site.data->>'town' as town, site.data->>'postal' as postal, site.data->>'email' as shop_email,
      site.data->>'published' as site_published, sh.data->>'ownerMobile' as owner_mobile,
      (select coalesce(json_agg(json_build_object('email', u.email, 'name', u.name, 'role', u.role) order by u.role desc, u.id), '[]') from users u where u.shop_id = s.id) as users,
      (select count(*)::int from customers c where c.shop_id = s.id and not (c.data ? 'example')) as customers,
      (select count(*)::int from jobs j where j.shop_id = s.id and not (j.data ? 'example') and not (j.data ? 'opening')) as jobs,
      (select count(*)::int from requests r where r.shop_id = s.id) as requests,
      (select count(*)::int from imports i where i.shop_id = s.id) as imports,
      greatest((select max(changed_at) from change_log l where l.shop_id = s.id), (select max(created_at) from requests r where r.shop_id = s.id)) as last_active,
      (select coalesce(json_agg(d.host order by d.host), '[]') from shop_domains d where d.shop_id = s.id) as domains
    from shops s
    left join settings site on site.shop_id = s.id and site.id = 'site'
    left join settings sh on sh.shop_id = s.id and sh.id = 'shop'
    order by s.created_at desc`)).rows);

  const shops = rows.map((s) => {
    const state = shopState(s);
    const cur = s.country === "CA" ? "cad" : "usd";
    const paying = s.source !== "original" && (state === "active" || state === "past_due") && !!s.stripe_subscription_id;
    const owner = s.users.find((u) => u.role === "owner") || s.users[0] || null;
    return {
      id: s.id, slug: s.slug, name: s.name, status: state, original: s.source === "original", source: s.source || "",
      createdAt: s.created_at, trialEndsAt: s.trial_ends_at, daysLeft: state === "trial" ? daysLeft(s) : null,
      convertedAt: s.converted_at, setupPaidAt: s.setup_paid_at, pastDueSince: s.past_due_since,
      country: s.country, region: s.region || "", town: s.town || "", street: s.street || "", postal: s.postal || "",
      phone: s.phone || "", website: s.website_url || "", techs: s.techs_band || "", shopEmail: s.shop_email || "",
      owner, ownerMobile: s.owner_mobile || "", logins: s.users.length,
      customers: s.customers, jobs: s.jobs, requests: s.requests, imported: s.imports > 0,
      lastActive: s.last_active, bookingUrl: bookingUrl(s.slug), domains: s.domains,
      embedSeenAt: s.embed_seen_at, embedSeenUrl: s.embed_seen_url || "", sitePublished: s.site_published === "true",
      stripeCustomer: s.stripe_customer_id || "", paying, currency: cur.toUpperCase(),
      monthly: paying ? PRICES[cur].monthly / 100 : 0,
    };
  });
  return NextResponse.json({ shops, me: user.email, hasShop: !!user.sid, now: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

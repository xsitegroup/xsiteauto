import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { query } from "@/lib/db";
import { COOKIE, signSession, cookieOptions } from "@/lib/auth";
import { createTrialShop } from "@/lib/provision";
import { codeHash } from "@/lib/signup-check";
import { TRIAL_EMAILS } from "@/lib/trial-mail";
import { notifyXSite } from "@/lib/xsite";
import { bookingUrl } from "@/lib/shop";

// Step 2: the emailed code. Creates the shop and its owner, signs them in, and tells XSite.
const bad = (error, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req) {
  const { id, code } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/.test(String(id || "")) || !/^\d{6}$/.test(String(code || "").trim())) return bad("Enter the 6-digit code from the email.");
  const { rows } = await query("select * from signups where id = $1 and expires_at > now()", [id]);
  const s = rows[0];
  if (!s) return bad("That code has expired. Go back and send a new one.", 410);
  if (s.tries >= 5) return bad("Too many wrong codes. Go back and send a new one.", 429);
  const a = Buffer.from(codeHash(id, String(code).trim())), b = Buffer.from(s.code_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await query("update signups set tries = tries + 1 where id = $1", [id]);
    return bad(`That code isn't right. ${Math.max(0, 4 - s.tries)} tries left.`);
  }
  const d = s.data;
  if ((await query("select 1 from users where lower(email) = lower($1)", [d.email])).rows[0]) return bad("That email already has an XSite Auto account. Sign in instead.", 409);

  const shop = await createTrialShop(d);
  await query("delete from signups where lower(email) = lower($1)", [d.email]);
  const owner = { email: d.email, name: d.name };

  const res = NextResponse.json({ ok: true, slug: shop.slug });
  res.cookies.set(COOKIE, await signSession({ ...owner, shop_id: shop.id, role: "owner" }), cookieOptions());

  // Welcome email and a heads-up to XSite. Neither holds up the new account.
  await Promise.allSettled([
    TRIAL_EMAILS.welcome({ shop, owner }).then((r) => r?.sent && query("update shops set emails_sent = emails_sent || jsonb_build_object('welcome', now()) where id = $1", [shop.id])),
    notifyXSite("trial_started", {
      subject: `New XSite Auto trial: ${shop.name} (${shop.region}, ${shop.country})`,
      heading: "New free trial",
      intro: `${d.name} just started a 14-day trial.`,
      rows: [["Shop", shop.name], ["Contact", d.name], ["Mobile", d.mobile], ["Shop phone", d.shopPhone], ["Email", d.email],
        ["Address", `${d.street}, ${d.city}, ${d.region} ${d.postal}`], ["Website", d.website || "none"], ["Technicians", d.techs], ["Booking page", bookingUrl(shop.slug)]],
      data: { shop: { id: shop.id, slug: shop.slug, name: shop.name, country: shop.country, region: shop.region, phone: d.shopPhone, website: d.website || null, techs: d.techs, trialEndsAt: shop.trial_ends_at },
        contact: { name: d.name, email: d.email, mobile: d.mobile }, source: d.source || null },
    }),
  ]).then((r) => r.forEach((x) => { if (x.status === "rejected") console.error("signup follow-up:", x.reason?.message); }));
  return res;
}

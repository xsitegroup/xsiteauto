import { NextResponse } from "next/server";
import { query, inShop } from "@/lib/db";
import { TRIAL_EMAILS } from "@/lib/trial-mail";
import { notifyXSite } from "@/lib/xsite";
import { forgetShop } from "@/lib/shop";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Runs every morning (vercel.json: 6 am Eastern). Safe to run more than once: every email is sent at most once.
//  - trial emails on their day, only when they still apply
//  - trials past their end date become read-only
//  - card failed for 7 days: read-only
//  - an unconverted trial gets a final notice 26 days after it ends and is closed at 30 days
//    (its data is deleted only when AUTO_DELETE_CLOSED=on; otherwise XSite deletes it by hand)
//  - a summary email to XSite
// Vercel sends Authorization: Bearer $CRON_SECRET. ?dry=1 shows what would happen without doing it.
const DAY = 864e5;

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const now = Date.now();
  const log = [];
  const digest = { ended: [], ending: [], closed: [], readOnly: [] };

  const { rows: shops } = await query("select * from shops where status in ('trial', 'past_due', 'read_only') order by created_at");
  for (const shop of shops) {
    const sent = shop.emails_sent || {};
    const { rows: owners } = await query("select email, name from users where shop_id = $1 and role = 'owner' order by id limit 1", [shop.id]);
    const owner = owners[0];
    const send = async (key, extra = {}) => {
      if (sent[key] || !owner) return;
      log.push(`${shop.slug}: email ${key}`);
      if (dry) return;
      try {
        const r = await TRIAL_EMAILS[key]({ shop, owner, ...extra });
        if (!r?.sent) { log.push(`${shop.slug}: ${key} not sent (email isn't set up)`); return; }
        await query("update shops set emails_sent = emails_sent || jsonb_build_object($2::text, now()) where id = $1", [shop.id, key]);
      } catch (e) { console.error(`cron ${shop.slug} ${key}:`, e.message); }
    };
    const setStatus = async (sql, note) => { log.push(`${shop.slug}: ${note}`); if (!dry) { await query(`update shops set ${sql} where id = $1`, [shop.id]); forgetShop(); } };

    if (shop.status === "trial") {
      const ends = new Date(shop.trial_ends_at).getTime();
      if (ends <= now) {
        await setStatus("status = 'read_only', read_only_since = now()", "trial ended, now read-only");
        await send("ended");
        digest.ended.push(shop.name);
        continue;
      }
      const age = (now - new Date(shop.created_at).getTime()) / DAY;
      const stats = await inShop(shop.id, async (q) => ({
        customers: (await q("select count(*)::int as n from customers where coalesce(data->>'example','') = ''")).rows[0].n,
        jobs: (await q("select count(*)::int as n from jobs where coalesce(data->>'example','') = '' and coalesce(data->>'opening','') = ''")).rows[0].n,
        bookings: (await q("select count(*)::int as n from requests where data->>'kind' = 'booking'")).rows[0].n,
        imports: (await q("select count(*)::int as n from imports where coalesce(data->>'undone', '') = ''")).rows[0].n,
      }));
      if (age >= 1 && !shop.embed_seen_at) await send("booking");
      if (age >= 3 && stats.customers < 10 && !stats.imports) await send("import");
      if (age >= 7) await send("checkin");
      if (ends - now <= 3 * DAY) { await send("ending", { stats }); digest.ending.push(shop.name); }
      continue;
    }

    if (shop.status === "past_due" && shop.past_due_since && now - new Date(shop.past_due_since).getTime() > 7 * DAY) {
      await setStatus("status = 'read_only', read_only_since = now()", "payment failed for 7 days, now read-only");
      digest.readOnly.push(shop.name);
      continue;
    }

    // Read-only after an unconverted trial: final notice, then close.
    if (shop.status === "read_only" && !shop.converted_at && shop.trial_ends_at) {
      const since = (now - new Date(shop.trial_ends_at).getTime()) / DAY;
      if (since >= 26) await send("final");
      if (since >= 30) {
        if (process.env.AUTO_DELETE_CLOSED === "on") {
          log.push(`${shop.slug}: closed and deleted`);
          if (!dry) { await query("delete from shops where id = $1", [shop.id]); forgetShop(); }
        } else {
          await setStatus("status = 'closed'", "closed (data kept until XSite deletes it)");
        }
        digest.closed.push(shop.name);
      }
    }
  }

  // XSite's daily summary.
  const { rows: fresh } = await query("select name, region, country from shops where created_at > now() - interval '1 day' and source is distinct from 'original' order by created_at");
  const { rows: installs } = await query("select name from shops where embed_seen_at > now() - interval '1 day'");
  const { rows: sales } = await query("select name from shops where converted_at > now() - interval '1 day' and source is distinct from 'original'");
  const lines = [
    ["New trials", fresh.map((s) => `${s.name} (${s.region}, ${s.country})`).join(", ")],
    ["Booking form installed", installs.map((s) => s.name).join(", ")],
    ["Kept XSite Auto", sales.map((s) => s.name).join(", ")],
    ["Trials ending within 3 days", digest.ending.join(", ")],
    ["Trials ended today", digest.ended.join(", ")],
    ["Read-only after failed payment", digest.readOnly.join(", ")],
    ["Closed", digest.closed.join(", ")],
  ].filter(([, v]) => v);
  if (lines.length && !dry) {
    await notifyXSite("daily_summary", { subject: `XSite Auto today: ${fresh.length} new trial${fresh.length === 1 ? "" : "s"}, ${sales.length} sale${sales.length === 1 ? "" : "s"}`,
      heading: "XSite Auto daily summary", intro: "What happened with trials in the last day.", rows: lines, data: { summary: Object.fromEntries(lines) } });
  }
  return NextResponse.json({ ok: true, dry, actions: log, summary: Object.fromEntries(lines) });
}

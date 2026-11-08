import { NextResponse } from "next/server";
import { inShop, query, TABLES } from "@/lib/db";
import { signedIn } from "@/lib/guard";
import { shopInfo } from "@/lib/shop";

export const dynamic = "force-dynamic";

// Everything the page needs in one call: { customers:{id:doc}, jobs:{...}, cash:{...}, settings:{shop:{...}}, shop, me }
export async function GET() {
  const g = await signedIn();
  if (g.error) return g.error;
  const out = await inShop(g.shop.id, async (q) => {
    const o = {};
    for (const [name, table] of Object.entries(TABLES)) {
      const sql = name === "requests"
        ? "select id, data from requests where data->>'status' = 'new' or created_at > now() - interval '60 days' order by created_at desc limit 500"
        : `select id, data from ${table}`;
      const { rows } = await q(sql);
      o[name] = Object.fromEntries(rows.map((r) => [r.id, r.data]));
    }
    const { rows: imp } = await q("select id, data, created_at from imports where created_at > now() - interval '7 days' order by created_at desc");
    o.imports = imp.map((r) => ({ id: r.id, ...r.data, createdAt: r.created_at }));
    const { rows: rem } = await q("select job_id, appt_date::text as date, status, reply, sent_at, replied_at, test, error from reminders where appt_date >= current_date - 7");
    o.reminders = Object.fromEntries(rem.map((r) => [`${r.job_id}|${r.date}`, { status: r.status, reply: r.reply || "", sentAt: r.sent_at, repliedAt: r.replied_at, test: r.test, error: r.error || "" }]));
    return o;
  });
  out.shop = shopInfo(g.shop);
  out.siteHost = (await query("select host from shop_domains where shop_id = $1 and kind = 'site' and host not like 'www.%' order by host limit 1", [g.shop.id])).rows[0]?.host || "";
  out.me = { email: g.user.email, name: g.user.name, role: g.user.role || "owner" };
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}

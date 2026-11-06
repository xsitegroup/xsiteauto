import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { signedIn } from "@/lib/guard";
import { makeToken } from "@/lib/tokens";
import { inviteEmail } from "@/lib/system-mail";
import { shopAppUrl } from "@/lib/shop";

// The shop's logins. Everyone can see the list; only the owner can invite or remove people.
export async function GET() {
  const g = await signedIn();
  if (g.error) return g.error;
  const { rows } = await query("select email, name, role, created_at from users where shop_id = $1 order by role desc, name", [g.shop.id]);
  const { rows: inv } = await query("select email, data, expires_at from tokens where shop_id = $1 and kind = 'invite' and used_at is null and expires_at > now() order by created_at desc", [g.shop.id]);
  return NextResponse.json({ users: rows, invites: inv.map((i) => ({ email: i.email, name: i.data?.name || "", expires: i.expires_at })) });
}

export async function POST(req) {
  const g = await signedIn({ write: true, owner: true });
  if (g.error) return g.error;
  const { email, name } = await req.json().catch(() => ({}));
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  if ((await query("select 1 from users where lower(email) = $1", [e])).rows[0]) return NextResponse.json({ error: "That email already has an XSite Auto login." }, { status: 409 });
  const { rows: n } = await query("select count(*)::int as n from tokens where shop_id = $1 and kind = 'invite' and created_at > now() - interval '1 day'", [g.shop.id]);
  if (n[0].n >= 20) return NextResponse.json({ error: "That's a lot of invites today. Try again tomorrow." }, { status: 429 });
  const t = await makeToken("invite", { email: e, shopId: g.shop.id, data: { name: String(name || "").trim().slice(0, 80), by: g.user.email }, hours: 24 * 7 });
  const link = `${await shopAppUrl(g.shop)}/invite?token=${t}`;
  // If email isn't set up (or fails), hand the link back so the owner can send it themselves.
  let sent = false;
  try { sent = !!(await inviteEmail(e, { shopName: g.shop.name, from: g.user.name || g.user.email, link }))?.sent; }
  catch (x) { console.error("invite:", x.message); }
  return NextResponse.json(sent ? { ok: true, emailed: true } : { ok: true, emailed: false, link });
}

export async function DELETE(req) {
  const g = await signedIn({ owner: true });
  if (g.error) return g.error;
  const { email } = await req.json().catch(() => ({}));
  const e = String(email || "").trim().toLowerCase();
  if (e === String(g.user.email).toLowerCase()) return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
  await query("delete from users where lower(email) = $1 and shop_id = $2 and role <> 'owner'", [e, g.shop.id]);
  await query("update tokens set used_at = now() where kind = 'invite' and shop_id = $1 and email = $2 and used_at is null", [g.shop.id, e]);
  return NextResponse.json({ ok: true });
}

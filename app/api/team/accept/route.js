import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { peekToken, useToken } from "@/lib/tokens";
import { COOKIE, signSession, cookieOptions } from "@/lib/auth";
import { shopById } from "@/lib/shop";

// GET ?token=: who the invite is for (so the page can greet them). POST: set a password and sign in.
export async function GET(req) {
  const t = await peekToken("invite", new URL(req.url).searchParams.get("token"));
  if (!t) return NextResponse.json({ error: "That invite has expired or was already used." }, { status: 410 });
  const shop = await shopById(t.shop_id);
  return NextResponse.json({ email: t.email, name: t.data?.name || "", shopName: shop?.name || "" });
}

export async function POST(req) {
  const { token, name, password } = await req.json().catch(() => ({}));
  if (String(password || "").length < 10) return NextResponse.json({ error: "Use a password of at least 10 characters." }, { status: 400 });
  if (!String(name || "").trim()) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  const t = await useToken("invite", token);
  if (!t) return NextResponse.json({ error: "That invite has expired or was already used. Ask the shop owner for a new one." }, { status: 410 });
  if ((await query("select 1 from users where lower(email) = $1", [t.email])).rows[0]) return NextResponse.json({ error: "That email already has an XSite Auto login. Sign in instead." }, { status: 409 });
  const { rows } = await query(
    "insert into users (email, name, password_hash, shop_id, role, email_verified_at, invited_by) values ($1, $2, $3, $4, 'staff', now(), $5) returning email, name, shop_id, role",
    [t.email, String(name).trim().slice(0, 80), await bcrypt.hash(String(password), 10), t.shop_id, t.data?.by || null]);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await signSession(rows[0]), cookieOptions());
  return res;
}

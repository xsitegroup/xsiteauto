import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { COOKIE, signSession, cookieOptions } from "@/lib/auth";
import { shopById, shopState } from "@/lib/shop";

export async function POST(req) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  const { rows } = await query("select email, name, password_hash, shop_id, role from users where lower(email) = lower($1)", [String(email).trim()]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(String(password), user.password_hash));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.json({ error: "That email and password don't match." }, { status: 401 });
  }
  const shop = await shopById(user.shop_id);
  if (!shop || shopState(shop) === "closed") return NextResponse.json({ error: "This XSite Auto account has been closed. Call XSite at 905.346.0864 to reopen it." }, { status: 403 });
  const res = NextResponse.json({ ok: true, name: user.name });
  res.cookies.set(COOKIE, await signSession(user), cookieOptions());
  return res;
}

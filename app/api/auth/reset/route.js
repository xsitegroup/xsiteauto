import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { useToken } from "@/lib/tokens";
import { COOKIE, signSession, cookieOptions } from "@/lib/auth";

export async function POST(req) {
  const { token, password } = await req.json().catch(() => ({}));
  if (String(password || "").length < 10) return NextResponse.json({ error: "Use a password of at least 10 characters." }, { status: 400 });
  const t = await useToken("reset", token);
  if (!t) return NextResponse.json({ error: "That link has expired or was already used. Ask for a new one." }, { status: 410 });
  const { rows } = await query("update users set password_hash = $2 where lower(email) = $1 returning email, name, shop_id, role", [t.email, await bcrypt.hash(String(password), 10)]);
  if (!rows[0]) return NextResponse.json({ error: "That account no longer exists." }, { status: 404 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await signSession(rows[0]), cookieOptions());
  return res;
}

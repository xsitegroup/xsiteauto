import { NextResponse } from "next/server";
import { createHash, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { mailReady } from "@/lib/mail";
import { clientIp } from "@/lib/guard";
import { checkSignup, codeHash } from "@/lib/signup-check";
import { signupCodeEmail } from "@/lib/system-mail";

// Step 1 of a free trial: check the form, then email a 6-digit code. Nothing is created until the code is entered.
const bad = (error, status = 400, field) => NextResponse.json({ error, field }, { status });
const devCodes = () => process.env.SIGNUP_DEV_CODES === "on";

async function humanCheck(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: new URLSearchParams({ secret, response: token, remoteip: ip }), signal: AbortSignal.timeout(6000),
    });
    return !!(await r.json()).success;
  } catch { return false; }
}

export async function POST(req) {
  if (!mailReady(null) && !devCodes()) return bad("Free trials open very soon. Call us at 905.346.0864 and we'll set you up today.", 503);
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Something went wrong sending the form. Please try again.");
  if (String(b.website2 || "").trim()) return NextResponse.json({ id: "00000000-0000-0000-0000-000000000000" }); // spam trap
  const ip = clientIp(req);
  if (!(await humanCheck(b.turnstile, ip))) return bad("Please tick the box to show you're not a robot, then try again.");
  const c = checkSignup(b);
  if (c.error) return bad(c.error, 400, c.field);
  const d = c.ok;

  const ipHash = createHash("sha256").update("signup|" + ip + "|" + (process.env.AUTH_SECRET || "")).digest("hex").slice(0, 32);
  const { rows: lim } = await query(
    `select count(*) filter (where ip_hash = $1)::int as by_ip, count(*) filter (where lower(email) = $2)::int as by_email
       from signups where created_at > now() - interval '1 hour'`, [ipHash, d.email]);
  if (lim[0].by_ip >= 5 || lim[0].by_email >= 3) return bad("Too many tries from here in the last hour. Please wait a bit, or call us at 905.346.0864.", 429);
  if ((await query("select 1 from users where lower(email) = $1", [d.email])).rows[0]) return bad("That email already has an XSite Auto account. Sign in, or use Forgot password.", 409, "email");
  if ((await query("select 1 from shops where phone = $1", [d.shopPhone])).rows[0]) return bad("This shop phone number already has an XSite Auto account. Call us at 905.346.0864 if you need a hand.", 409, "shopPhone");

  const { password, ...rest } = d;
  const data = { ...rest, passwordHash: await bcrypt.hash(password, 10) };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { rows } = await query(
    "insert into signups (email, data, code_hash, ip_hash, expires_at) values ($1, $2, 'x', $3, now() + interval '15 minutes') returning id",
    [d.email, data, ipHash]);
  const id = rows[0].id;
  await query("update signups set code_hash = $2 where id = $1", [id, codeHash(id, code)]);
  try {
    if (mailReady(null)) await signupCodeEmail(d.email, code);
  } catch (e) {
    console.error("signup: code email failed", e.message);
    return bad("We couldn't send the email just now. Check the address, or try again in a minute.", 502, "email");
  }
  return NextResponse.json({ id, email: d.email, ...(devCodes() ? { devCode: code } : {}) });
}

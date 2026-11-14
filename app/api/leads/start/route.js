import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { mailReady } from "@/lib/mail";
import { clientIp } from "@/lib/guard";
import { checkLead, newToken, tokenHash, confirmLink, leadConfirmEmail } from "@/lib/leads";

// "Send me more information": save the request and email a confirm link.
const bad = (error, status = 400, field) => NextResponse.json({ error, field }, { status });
const devLinks = () => process.env.SIGNUP_DEV_CODES === "on";

export async function POST(req) {
  if (!mailReady(null) && !devLinks()) return bad("Our email is down for a moment. Call us at 905.346.0864 and we'll send the guides.", 503);
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Something went wrong sending the form. Please try again.");
  if (String(b.website2 || "").trim()) return NextResponse.json({ ok: true, email: String(b.email || "") }); // spam trap
  const c = checkLead(b);
  if (c.error) return bad(c.error, 400, c.field);
  const d = c.ok;

  const ip = clientIp(req);
  const ipHash = createHash("sha256").update("lead|" + ip + "|" + (process.env.AUTH_SECRET || "")).digest("hex").slice(0, 32);
  const { rows: lim } = await query(
    `select count(*) filter (where ip_hash = $1)::int as by_ip, count(*) filter (where lower(email) = $2)::int as by_email
       from leads where created_at > now() - interval '1 hour'`, [ipHash, d.email]);
  if (lim[0].by_ip >= 6 || lim[0].by_email >= 3) return bad("Too many tries from here in the last hour. Please wait a bit, or call us at 905.346.0864.", 429);

  const { agree, ...data } = d;
  const t = newToken();
  await query("insert into leads (email, data, token_hash, ip_hash) values ($1, $2, $3, $4)", [d.email, data, tokenHash(t), ipHash]);
  try {
    if (mailReady(null)) await leadConfirmEmail(d.email, d.name, confirmLink(t));
  } catch (e) {
    console.error("leads: confirm email failed", e.message);
    return bad("We couldn't send the email just now. Check the address, or try again in a minute.", 502, "email");
  }
  return NextResponse.json({ ok: true, email: d.email, ...(devLinks() ? { devLink: confirmLink(t) } : {}) });
}

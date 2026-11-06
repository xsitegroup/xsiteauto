import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { makeToken } from "@/lib/tokens";
import { resetEmail } from "@/lib/system-mail";
import { APP_URL } from "@/lib/shop";

// Always answers the same way, so it can't be used to find out who has an account.
export async function POST(req) {
  const { email } = await req.json().catch(() => ({}));
  const e = String(email || "").trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) {
    const { rows } = await query("select email from users where lower(email) = $1", [e]);
    const { rows: recent } = await query("select count(*)::int as n from tokens where kind = 'reset' and email = $1 and created_at > now() - interval '1 hour'", [e]);
    if (rows[0] && recent[0].n < 3) {
      const t = await makeToken("reset", { email: e, hours: 1 });
      try { await resetEmail(e, `${APP_URL()}/reset?token=${t}`); } catch (x) { console.error("forgot:", x.message); }
    }
  }
  return NextResponse.json({ ok: true });
}

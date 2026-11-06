import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { inShop } from "@/lib/db";
import { publicShop, isOpen } from "@/lib/shop";

// Public: tells a returning customer WHICH details are missing from their file, and lists
// their vehicles as year/make/model only (no plate, VIN, address or email) so they can tap one.
// Never returns contact details. Needs both name and phone to match.
const LIMIT_PER_HOUR = 10;
const normName = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function digits10(p) {
  const d = String(p || "").replace(/\D/g, "");
  let x = d.length > 10 && d[0] === "1" ? d.slice(1) : d; // drop the +1 country code
  if (x.length === 11 && x[0] === "0") x = x.slice(1);     // and a stray leading 0 (+1 0905...)
  return x.length === 10 ? x : "";
}

export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return NextResponse.json({ match: false }); }
  const name = normName(b?.name), phone = digits10(b?.phone);
  if (!name || !phone) return NextResponse.json({ match: false });

  const shop = await publicShop(req.headers);
  if (!shop || !isOpen(shop)) return NextResponse.json({ match: false });
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const ipHash = createHash("sha256").update("check|" + ip + "|" + (process.env.AUTH_SECRET || "")).digest("hex").slice(0, 32);
  try {
    return await inShop(shop.id, async (query) => {
    const { rows: n } = await query("select count(*)::int as n from lookups where ip_hash = $1 and created_at > now() - interval '1 hour'", [ipHash]);
    if (n[0].n >= LIMIT_PER_HOUR) return NextResponse.json({ match: false });
    await query("insert into lookups (ip_hash) values ($1)", [ipHash]);
    const { rows } = await query("select data from customers where regexp_replace(coalesce(data->>'phone',''), '\\D', '', 'g') in ($1, '1' || $1)", [phone]);
    const c = rows.map((r) => r.data).find((d) => normName(d.name) === name);
    if (!c) return NextResponse.json({ match: false });
    const has = (k) => !!String(c[k] || "").trim();
    return NextResponse.json({
      match: true,
      email: has("email"),
      address: has("street") && has("city"),
      postal: has("postal"),
      vehicles: Array.isArray(c.vehicles) ? c.vehicles.filter((v) => v && (v.make || v.model || v.plate)).length : 0,
      vehicleList: (Array.isArray(c.vehicles) ? c.vehicles : [])
        .filter((v) => v && (v.make || v.model))
        .map((v) => ({ year: String(v.year || "").slice(0, 4), make: String(v.make || "").slice(0, 40), model: String(v.model || "").slice(0, 60) }))
        .slice(0, 8),
    });
    });
  } catch (e) {
    console.error("requests/check", e.message);
    return NextResponse.json({ match: false });
  }
}

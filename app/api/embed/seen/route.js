import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { publicShop, forgetShop } from "@/lib/shop";

// Called by embed.js when the booking form loads on a shop's website. Records the first time only.
export async function POST(req) {
  const shop = await publicShop(req.headers);
  if (!shop || shop.embed_seen_at) return NextResponse.json({ ok: true });
  let url = "";
  try { url = String(JSON.parse(await req.text())?.url || "").slice(0, 300); } catch {}
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return NextResponse.json({ ok: true }); }
  // Previews inside XSite Auto itself don't count as being on the shop's website.
  if (!host || host === "localhost" || host.endsWith("xsiteauto.com") || host.endsWith(".vercel.app")) return NextResponse.json({ ok: true });
  await query("update shops set embed_seen_at = now(), embed_seen_url = $2 where id = $1 and embed_seen_at is null", [shop.id, url]);
  forgetShop();
  return NextResponse.json({ ok: true });
}

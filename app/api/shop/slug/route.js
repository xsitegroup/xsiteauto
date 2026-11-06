import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { signedIn } from "@/lib/guard";
import { slugify, RESERVED_SLUGS, forgetShop, bookingUrl } from "@/lib/shop";

// Change the booking page address once (e.g. main-street-auto-2 -> mainstreetauto).
export async function POST(req) {
  const g = await signedIn({ write: true, owner: true });
  if (g.error) return g.error;
  if (g.shop.slug_changed) return NextResponse.json({ error: "The booking address has already been changed once. Call XSite to change it again." }, { status: 409 });
  const { slug } = await req.json().catch(() => ({}));
  const s = slugify(slug);
  if (s.length < 3) return NextResponse.json({ error: "Use at least 3 letters or numbers." }, { status: 400 });
  if (RESERVED_SLUGS.has(s)) return NextResponse.json({ error: "That address is reserved. Try another." }, { status: 409 });
  if (s === g.shop.slug) return NextResponse.json({ ok: true, slug: s, bookingUrl: bookingUrl(s) });
  if ((await query("select 1 from shops where slug = $1", [s])).rows[0]) return NextResponse.json({ error: "That address is taken. Try another." }, { status: 409 });
  await query("update shops set slug = $2, slug_changed = true, embed_seen_at = null, embed_seen_url = null where id = $1", [g.shop.id, s]);
  forgetShop();
  return NextResponse.json({ ok: true, slug: s, bookingUrl: bookingUrl(s) });
}

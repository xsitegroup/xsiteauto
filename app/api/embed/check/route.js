import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { query } from "@/lib/db";
import { signedIn } from "@/lib/guard";
import { forgetShop, BOOK_HOST } from "@/lib/shop";

export const dynamic = "force-dynamic";

// "Check again": looks at the shop's website for the booking form or a link to its booking page.
// Saves the website address if a new one is given.
const COMMON = ["", "/contact", "/contact-us", "/book", "/book-online", "/appointments", "/schedule", "/services"];

// Only public websites: the address (and every redirect) must resolve to a public IP.
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:") && privateIp(x.slice(7));
}
async function publicUrl(u) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol) || (url.port && !["80", "443"].includes(url.port))) return false;
    const addrs = await lookup(url.hostname, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateIp(a.address));
  } catch { return false; }
}
async function get(url, hops = 0) {
  if (hops > 4 || !(await publicUrl(url))) return "";
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "manual", headers: { "user-agent": "XSiteAutoBookingCheck/1.0 (+https://xsiteauto.com)" } });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) return get(new URL(r.headers.get("location"), url).href, hops + 1);
    if (!r.ok) return "";
    return (await r.text()).slice(0, 2_000_000);
  } catch { return ""; } finally { clearTimeout(t); }
}

export async function POST(req) {
  const g = await signedIn({ write: true });
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  let site = String(body.website ?? g.shop.website_url ?? "").trim();
  if (!site) return NextResponse.json({ found: false, reason: "no_site" });
  if (!/^https?:\/\//i.test(site)) site = "https://" + site;
  let base;
  try { base = new URL(site); } catch { return NextResponse.json({ error: "That website address doesn't look right." }, { status: 400 }); }
  if (!/\./.test(base.hostname) || !(await publicUrl(base.origin))) return NextResponse.json({ error: "We couldn't find that website. Check the address." }, { status: 400 });
  if (site !== g.shop.website_url) await query("update shops set website_url = $2 where id = $1", [g.shop.id, base.origin]);

  const slug = g.shop.slug;
  const marks = [`data-shop="${slug}"`, `data-shop='${slug}'`, `${BOOK_HOST()}/${slug}`];
  const pages = new Set(COMMON.map((p) => base.origin + p));
  const sm = await get(base.origin + "/sitemap.xml");
  for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    if (/contact|book|appoint|schedul|service/i.test(m[1]) && pages.size < 14) pages.add(m[1].trim());
  }
  for (const url of pages) {
    const html = await get(url);
    if (html && marks.some((k) => html.includes(k))) {
      await query("update shops set embed_seen_at = coalesce(embed_seen_at, now()), embed_seen_url = coalesce(embed_seen_url, $2) where id = $1", [g.shop.id, url]);
      forgetShop();
      return NextResponse.json({ found: true, url });
    }
  }
  forgetShop();
  return NextResponse.json({ found: false, checked: pages.size, site: base.origin });
}

import { BLANK_SITE } from "./site-template";

export const DEFAULT_SITE = BLANK_SITE;

// The shop's website content. `q` is a query function from inShop() for this shop.
// Gaps are filled from a blank template, never from another shop's content.
export async function getSite(q, shop) {
  let saved = {};
  let shopName = shop?.name || "";
  try {
    const { rows } = await q("select id, data from settings where id in ('site','shop')");
    for (const r of rows) {
      if (r.id === "site") saved = r.data || {};
      if (r.id === "shop" && r.data?.shopName) shopName = r.data.shopName;
    }
  } catch (e) {
    console.error("getSite: database unavailable", e.message);
  }
  const site = { ...BLANK_SITE, ...saved, shopName, country: shop?.country || "CA", slug: shop?.slug || "", timeZone: shop?.timezone || "America/Toronto" };
  if (!Array.isArray(site.hours) || site.hours.length !== 7) site.hours = BLANK_SITE.hours;
  if (!Array.isArray(site.services)) site.services = [];
  if (!Array.isArray(site.photos)) site.photos = [];
  for (const k of ["proof", "specialties", "beforeAfter", "faqs", "featuredReviews"]) if (!Array.isArray(site[k])) site[k] = [];
  if (!site.banner || typeof site.banner !== "object") site.banner = BLANK_SITE.banner;
  return site;
}

// The shop's own settings record (labour rate, tax, booking limits, technicians).
export async function getShopSettings(q) {
  try { const { rows } = await q("select data from settings where id = 'shop'"); return rows[0]?.data || {}; }
  catch { return {}; }
}

// Live Google rating and recent reviews, refreshed once a day.
// Needs GOOGLE_PLACES_API_KEY and the shop's Place ID; otherwise returns null.
export async function getReviews(placeId) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !placeId) return null;
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,reviews,googleMapsUri" },
      next: { revalidate: 86400 },
    });
    if (!r.ok) return null;
    const d = await r.json();
    const reviews = (d.reviews || [])
      .filter((v) => (v.text?.text || v.originalText?.text) && v.rating >= 4)
      .slice(0, 3)
      .map((v) => ({
        rating: v.rating,
        text: v.text?.text || v.originalText?.text,
        author: v.authorAttribution?.displayName || "Google user",
        authorUri: v.authorAttribution?.uri || "",
        when: v.relativePublishTimeDescription || "",
      }));
    return { rating: d.rating, count: d.userRatingCount, mapsUri: d.googleMapsUri, reviews };
  } catch {
    return null;
  }
}

export function digits10(p) {
  const d = String(p || "").replace(/\D/g, "");
  const x = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
  return x.length === 10 ? x : "";
}
export const fmtPhone = (p) => { const x = digits10(p); return x ? `${x.slice(0, 3)}-${x.slice(3, 6)}-${x.slice(6)}` : String(p || ""); };
// Only real https links to the named site are shown on the public page.
export function socialUrl(u, host) {
  try { const x = new URL(String(u || "").trim()); return x.protocol === "https:" && (x.hostname === host || x.hostname.endsWith("." + host)) ? x.href : ""; }
  catch { return ""; }
}
export const telHref = (p) => { const x = digits10(p); return x ? `+1${x}` : ""; };

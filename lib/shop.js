import { query } from "./db";

// Which shop a request is for.
//  - Signed-in Shop Book: the shop in the user's session.
//  - book.xsiteauto.com/{slug}: the slug (middleware passes it as x-shop-slug).
//  - A shop's own domain (e.g. joesgarage.ca): the shop_domains table.

const COLS = `id, slug, name, status, trial_ends_at, country, region, timezone, phone, website_url, techs_band,
  slug_changed, embed_seen_at, embed_seen_url, stripe_customer_id, stripe_subscription_id, setup_paid_at,
  converted_at, past_due_since, read_only_since, emails_sent, created_at`;

const cache = globalThis.__xaShopCache || new Map();
globalThis.__xaShopCache = cache;
const TTL = 20_000;

async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.shop;
  const shop = await load();
  cache.set(key, { shop, at: Date.now() });
  return shop;
}
export function forgetShop() { cache.clear(); }

export const shopById = (id) => !id ? null : cached("id:" + id, async () =>
  (await query(`select ${COLS} from shops where id = $1`, [id])).rows[0] || null);
export const shopBySlug = (slug) => !slug ? null : cached("slug:" + slug, async () =>
  (await query(`select ${COLS} from shops where slug = $1`, [String(slug).toLowerCase()])).rows[0] || null);
export const shopByHost = (host) => !host ? null : cached("host:" + host, async () => {
  const h = String(host).split(":")[0].toLowerCase();
  const alt = h.startsWith("www.") ? h.slice(4) : "www." + h;
  return (await query(`select ${COLS.split(",").map((c) => "s." + c.trim()).join(", ")} from shop_domains d join shops s on s.id = d.shop_id where d.host = any($1) limit 1`, [[h, alt]])).rows[0] || null;
});

// For public pages and endpoints. `h` is a Headers object (req.headers, or await headers()).
export async function publicShop(h) {
  const slug = h.get("x-shop-slug");
  if (slug) return shopBySlug(slug);
  const byHost = await shopByHost(h.get("x-forwarded-host") || h.get("host"));
  if (byHost) return byHost;
  return process.env.DEFAULT_SHOP_SLUG ? shopBySlug(process.env.DEFAULT_SHOP_SLUG) : null;
}

// For the signed-in Shop Book. Checks on every request that the person still has a login at that shop,
// so removing someone from the team signs them out straight away. Older sessions (before shops) carry only an email.
export async function sessionShop(user) {
  if (!user?.email) return null;
  const { rows } = await query("select shop_id, role from users where lower(email) = lower($1)", [user.email]);
  const u = rows[0];
  if (!u || (user.sid && user.sid !== u.shop_id)) return null;
  user.role = u.role;
  return shopById(u.shop_id);
}

// What the shop can do right now. A trial past its end date is treated as ended even before the nightly job runs.
export function shopState(shop) {
  if (!shop) return "missing";
  if (shop.status === "trial" && shop.trial_ends_at && new Date(shop.trial_ends_at) < new Date()) return "read_only";
  return shop.status;
}
export const canWrite = (shop) => ["trial", "active", "past_due"].includes(shopState(shop));
export const takesBookings = (shop) => ["trial", "active", "past_due"].includes(shopState(shop));
export const isOpen = (shop) => shopState(shop) !== "closed" && shopState(shop) !== "missing";

// Calendar days left in the shop's own time zone (the trial ends at 11:59 pm on its last day).
export function daysLeft(shop) {
  if (!shop?.trial_ends_at) return null;
  const day = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: shop.timezone || "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const diff = (Date.parse(day(new Date(shop.trial_ends_at))) - Date.parse(day(new Date()))) / 864e5;
  return Math.max(0, Math.round(diff));
}

// What the Shop Book needs to know about its shop (no billing ids).
export function shopInfo(shop) {
  if (!shop) return null;
  return {
    id: shop.id, slug: shop.slug, name: shop.name, status: shopState(shop), trialEndsAt: shop.trial_ends_at,
    daysLeft: shopState(shop) === "trial" ? daysLeft(shop) : null,
    country: shop.country, region: shop.region, timeZone: shop.timezone, websiteUrl: shop.website_url || "",
    slugChanged: !!shop.slug_changed, embedSeenAt: shop.embed_seen_at, embedSeenUrl: shop.embed_seen_url || "",
    paid: !!shop.converted_at, setupPaid: !!shop.setup_paid_at, currency: shop.country === "CA" ? "CAD" : "USD",
    prices: shop.country === "CA" ? { monthly: 139, setup: 695 } : { monthly: 99, setup: 495 }, bookingUrl: bookingUrl(shop.slug), billing: !!process.env.STRIPE_SECRET_KEY,
    setupCallUrl: process.env.SETUP_CALL_URL || "",
  };
}

export const BOOK_HOST = () => (process.env.BOOK_HOST || "book.xsiteauto.com").toLowerCase();
export const APP_URL = () => (process.env.APP_URL || "https://app.xsiteauto.com").replace(/\/$/, "");
export const bookingUrl = (slug) => `https://${BOOK_HOST()}/${slug}`;

export const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "") || "shop";

// Words that can't be a shop's booking address because the booking site uses them.
export const RESERVED_SLUGS = new Set(["api", "embed", "embed-js", "photos", "icons", "app", "book", "www", "admin", "signup", "login", "static", "next", "xsite", "xsiteauto", "help", "support"]);

export async function freeSlug(base, client = query) {
  let s = slugify(base);
  if (RESERVED_SLUGS.has(s)) s += "-shop";
  for (let i = 1; i < 200; i++) {
    const candidate = i === 1 ? s : `${s.slice(0, 46)}-${i}`;
    const { rows } = await client("select 1 from shops where slug = $1", [candidate]);
    if (!rows[0]) return candidate;
  }
  return `${s.slice(0, 40)}-${Date.now().toString(36)}`;
}

// Where this shop signs in: its own Shop Book address if it has one (e.g. shop.joesgarage.ca), otherwise the shared app.
export async function shopAppUrl(shop) {
  if (!shop) return APP_URL();
  const { rows } = await query("select host from shop_domains where shop_id = $1 and kind = 'app' order by host limit 1", [shop.id]);
  return rows[0] ? `https://${rows[0].host}` : APP_URL();
}

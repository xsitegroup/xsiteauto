import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Three kinds of address:
//   app.xsiteauto.com, shop.<anything>  -> the Shop Book (sign-in required) and trial signup
//   book.xsiteauto.com/{shop}           -> that shop's public booking page and its booking API
//   anything else (e.g. joesgarage.ca)  -> that shop's public website, found by domain
// APP_HOST, BOOK_HOST and SHOP_HOSTS (comma list, e.g. a vercel.app preview URL) can add or change these.
const env = (k, d) => (process.env[k] || d).toLowerCase();
const APP_HOST = env("APP_HOST", "app.xsiteauto.com");
const BOOK_HOST = env("BOOK_HOST", "book.xsiteauto.com");
const MARKETING = process.env.MARKETING_URL || "https://xsiteauto.com";

function hostKind(req) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const extra = (process.env.SHOP_HOSTS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (host === BOOK_HOST || host.startsWith("book.")) return "book";
  if (host === APP_HOST || host.startsWith("app.") || host.startsWith("shop.") || extra.includes(host)) return "app";
  return "site";
}

const SHARED = ["/photos/", "/icons/", "/favicon.ico", "/embed.js"];
const PUBLIC_API = ["/api/requests", "/api/requests/check", "/api/availability", "/api/embed/seen"];
const APP_OPEN = ["/login", "/signup", "/reset", "/invite", "/manifest.webmanifest", "/sw.js", "/book",
  "/api/auth/login", "/api/auth/forgot", "/api/auth/reset", "/api/signup/start", "/api/signup/verify",
  "/api/team/accept", "/api/billing/webhook", "/api/cron/daily", "/api/public/shop", ...PUBLIC_API];
const starts = (path, list) => list.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));

// Headers passed on to the page or API (never trusted from the visitor).
function forward(req, extra = {}) {
  const h = new Headers(req.headers);
  h.delete("x-shop-slug");
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return h;
}
const next = (req, extra) => NextResponse.next({ request: { headers: forward(req, extra) } });
const rewrite = (req, path, extra) => {
  const u = req.nextUrl.clone();
  u.pathname = path;
  return NextResponse.rewrite(u, { request: { headers: forward(req, extra) } });
};
// Booking pages may sit inside a shop's own website; nothing else may be framed.
const framable = (res) => { res.headers.set("Content-Security-Policy", "frame-ancestors *"); return res; };
const unframable = (res) => { res.headers.set("Content-Security-Policy", "frame-ancestors 'none'"); res.headers.set("X-Frame-Options", "DENY"); return res; };

// Called by Vercel (nightly job) and Stripe, on whatever address they use.
const ANY_HOST = ["/api/cron/daily", "/api/billing/webhook"];

export async function middleware(req) {
  const path = req.nextUrl.pathname;
  if (starts(path, SHARED) || starts(path, ANY_HOST)) return next(req);
  const kind = hostKind(req);

  // ---------- book.xsiteauto.com/{slug} ----------
  if (kind === "book") {
    if (path === "/" || path === "") return NextResponse.redirect(MARKETING);
    const m = /^\/([a-z0-9][a-z0-9-]{0,49})(\/.*)?$/.exec(path);
    if (!m) return new NextResponse("Not found", { status: 404 });
    const [, slug, rest = "/"] = m;
    if (rest === "/" || rest === "") return framable(rewrite(req, "/book", { "x-shop-slug": slug, "x-book-base": "/" + slug }));
    if (starts(rest, PUBLIC_API)) return rewrite(req, rest, { "x-shop-slug": slug });
    return new NextResponse("Not found", { status: 404 });
  }

  // ---------- a shop's own public website ----------
  if (kind === "site") {
    if (path === "/") return rewrite(req, "/site");
    if (path === "/book") return framable(next(req));
    if (path === "/robots.txt" || path === "/sitemap.xml") return next(req);
    if (starts(path, PUBLIC_API)) return next(req);
    if (path.startsWith("/api/")) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.redirect(new URL("/", req.url));
  }

  // ---------- the Shop Book ----------
  const res = await shop(req, path);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return path === "/book" ? framable(res) : unframable(res);
}

async function shop(req, path) {
  if (path === "/login") return rewrite(req, "/login.html");
  if (path === "/signup") return rewrite(req, "/signup.html");
  if (path === "/reset" || path === "/invite") return rewrite(req, "/reset.html");
  if (starts(path, APP_OPEN)) return next(req);
  const token = req.cookies.get("frs")?.value;
  let ok = false;
  if (token && process.env.AUTH_SECRET) {
    try { await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET)); ok = true; } catch {}
  }
  if (!ok) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "signed_out" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (path === "/") return rewrite(req, "/shop.html");
  if (path === "/site") return NextResponse.redirect(new URL("/preview", req.url));
  return next(req);
}

export const config = { matcher: ["/((?!_next/).*)"] };

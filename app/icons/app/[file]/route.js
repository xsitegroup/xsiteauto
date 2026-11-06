import { shopByHost } from "@/lib/shop";

// The Shop Book's icons: a shop's own set when one is listed here by slug, otherwise XSite Auto's.
// e.g. "joes-garage": { "192": "joes-192.png", "512": "joes-512.png", "maskable-512": "joes-maskable-512.png", apple: "joes-apple.png" }
const OWN = {};
const XSITE = { "192": "xsite-192.png", "512": "xsite-512.png", "maskable-512": "xsite-maskable-512.png", apple: "xsite-apple-touch-icon.png" };

export async function GET(req, { params }) {
  const { file } = await params;
  const key = String(file).replace(/\.png$/, "");
  if (!XSITE[key]) return new Response("Not found", { status: 404 });
  const shop = await shopByHost(req.headers.get("host")).catch(() => null);
  const name = (shop && OWN[shop.slug]?.[key]) || XSITE[key];
  return Response.redirect(new URL(`/icons/${name}`, req.url), 302);
}

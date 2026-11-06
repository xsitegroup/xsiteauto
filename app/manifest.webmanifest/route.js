import { shopByHost } from "@/lib/shop";

export const dynamic = "force-dynamic";

// What the Shop Book is called when it's added to a phone's home screen: the shop's name on its own address
// (e.g. shop.joesgarage.ca), otherwise XSite Auto.
export async function GET(req) {
  const shop = await shopByHost(req.headers.get("host")).catch(() => null);
  const name = shop?.name || "XSite Auto";
  const short = shop ? (shop.name.length <= 12 ? shop.name : shop.name.split(" ")[0] + " Shop") : "XSite Auto";
  return Response.json({
    name: shop ? `${name} · XSite Auto` : "XSite Auto",
    short_name: short,
    description: `Customers, bookings, repair orders, payments and the daily cash count${shop ? " for " + name : ""}.`,
    start_url: "/", scope: "/", display: "standalone", orientation: "portrait",
    background_color: "#eceff3", theme_color: "#1d5ea6",
    icons: [
      { src: "/icons/app/192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/app/512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/app/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } });
}

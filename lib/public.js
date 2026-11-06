import { inShop } from "./db";
import { publicShop, isOpen } from "./shop";
import { getSite, getShopSettings } from "./site";

// For public pages and endpoints: the shop this address belongs to, with its site and settings.
// Returns null when the address doesn't belong to an open shop.
export async function loadPublic(h) {
  const shop = await publicShop(h);
  if (!shop || !isOpen(shop)) return null;
  const { site, settings } = await inShop(shop.id, async (q) => ({ site: await getSite(q, shop), settings: await getShopSettings(q) }));
  return { shop, site, settings, timeZone: settings.timeZone || shop.timezone };
}

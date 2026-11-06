import bcrypt from "bcryptjs";
import { asSystem } from "./db";
import { freeSlug } from "./shop";
import { taxFor, timeZoneFor, endOfLocalDay } from "./locale";
import { newShopSite } from "./site-template";

export const TRIAL_DAYS = 14;

// Creates a trial shop and its owner in one transaction. `d` is the checked signup form.
export async function createTrialShop(d) {
  const timeZone = timeZoneFor(d.country, d.region);
  const { taxName, taxRate } = taxFor(d.country, d.region);
  const hash = d.passwordHash || (await bcrypt.hash(d.password, 10));
  return asSystem(async (q) => {
    const slug = await freeSlug(d.shopName, q);
    const { rows } = await q(
      `insert into shops (slug, name, status, trial_ends_at, country, region, timezone, phone, website_url, techs_band, source)
       values ($1, $2, 'trial', $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      [slug, d.shopName, endOfLocalDay(TRIAL_DAYS, timeZone), d.country, d.region, timeZone, d.shopPhone, d.website || null, d.techs, d.source || "signup"]);
    const shop = rows[0];
    await q(
      `insert into users (email, name, password_hash, shop_id, role, email_verified_at) values (lower($1), $2, $3, $4, 'owner', now())`,
      [d.email, d.name, hash, shop.id]);
    // From here on, the shop's own records.
    await q("select set_config('app.shop_id', $1, true)", [shop.id]);
    const settings = {
      shopName: d.shopName, labourRate: "", hstRate: taxRate === "" ? 0 : taxRate, taxName, taxConfirmed: false, timeZone,
      bookingPerSlot: 1, bookingPerDay: 6, bookingSlotMinutes: 30, techs: [], ownerMobile: d.mobile,
    };
    const site = newShopSite({ name: d.shopName, phone: d.shopPhone, email: d.email, street: d.street, town: d.city, region: d.region, postal: d.postal, taxName });
    await q("insert into settings (shop_id, id, data, updated_by) values ($1, 'shop', $2, 'signup'), ($1, 'site', $3, 'signup')", [shop.id, settings, site]);
    await q("insert into change_log (shop_id, collection, record_id, action, data, changed_by) values ($1, 'settings', 'shop', 'save', $2, 'signup')", [shop.id, settings]);
    return shop;
  });
}

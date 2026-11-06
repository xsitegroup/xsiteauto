// Permanently delete one shop and everything in it: logins, customers, jobs, cash, website, photos, requests.
//   npm run shop:delete -- <shop-slug>          shows what would be deleted
//   npm run shop:delete -- <shop-slug> --yes    deletes it
//   npm run shop:delete -- <shop-slug> --yes --paid
//       also deletes a shop that has paid (for test shops paid with Stripe test cards, or a
//       cancelled shop past its 90 days). Cancel its Stripe subscription first.
// There is no undo, apart from Neon's point-in-time restore of the whole database.
import pg from "pg";

const [slug, ...flags] = process.argv.slice(2);
const confirm = flags.includes("--yes") ? "--yes" : "";
const paidOk = flags.includes("--paid");
if (!slug) { console.error("Usage: npm run shop:delete -- <shop-slug> [--yes]"); process.exit(1); }
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set. Run `npx vercel env pull .env.local` first."); process.exit(1); }
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
await db.connect();
await db.query("set app.admin = 'on'");

const { rows } = await db.query("select id, name, slug, status, source, created_at, converted_at, stripe_subscription_id from shops where slug = $1", [slug.toLowerCase()]);
const shop = rows[0];
if (!shop) { console.error(`No shop "${slug}".`); await db.end(); process.exit(1); }
if (shop.source === "original" || (shop.converted_at && !paidOk)) {
  console.error(shop.source === "original" ? `${shop.name} is an original shop. Not deleting it from this script.`
    : `${shop.name} has paid. If it's a test shop or a cancelled shop past 90 days, cancel its Stripe subscription, then add --paid.`);
  await db.end(); process.exit(1);
}

console.log(`Shop: ${shop.name} (${shop.slug}), ${shop.status}, created ${new Date(shop.created_at).toLocaleString("en-CA", { timeZone: "America/Toronto" })}${shop.converted_at ? `, paid (Stripe subscription ${shop.stripe_subscription_id || "none"})` : ""}`);
for (const t of ["users", "customers", "jobs", "cash_days", "requests", "photos", "imports", "change_log", "shop_domains"]) {
  try {
    const { rows: c } = await db.query(`select count(*)::int n from ${t} where shop_id = $1`, [shop.id]);
    console.log(`  ${t.padEnd(12)} ${c[0].n}`);
  } catch { /* table not there */ }
}

if (confirm !== "--yes") {
  console.log(`\nNothing deleted. To delete it for good: npm run shop:delete -- ${shop.slug} --yes`);
} else {
  await db.query("delete from shops where id = $1", [shop.id]);
  console.log(`\nDeleted ${shop.name} and everything in it.`);
}
await db.end();

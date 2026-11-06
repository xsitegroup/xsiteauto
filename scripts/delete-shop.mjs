// Permanently delete one shop and everything in it: logins, customers, jobs, cash, website, photos, requests.
//   npm run shop:delete -- <shop-slug>          shows what would be deleted
//   npm run shop:delete -- <shop-slug> --yes    deletes it
// There is no undo, apart from Neon's point-in-time restore of the whole database.
import pg from "pg";

const [slug, confirm] = process.argv.slice(2);
if (!slug) { console.error("Usage: npm run shop:delete -- <shop-slug> [--yes]"); process.exit(1); }
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set. Run `npx vercel env pull .env.local` first."); process.exit(1); }
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
await db.connect();
await db.query("set app.admin = 'on'");

const { rows } = await db.query("select id, name, slug, status, source, created_at, converted_at from shops where slug = $1", [slug.toLowerCase()]);
const shop = rows[0];
if (!shop) { console.error(`No shop "${slug}".`); await db.end(); process.exit(1); }
if (shop.source === "original" || shop.converted_at) {
  console.error(`${shop.name} is ${shop.converted_at ? "a paying shop" : "an original shop"}. Not deleting it from this script.`);
  await db.end(); process.exit(1);
}

console.log(`Shop: ${shop.name} (${shop.slug}), ${shop.status}, created ${new Date(shop.created_at).toLocaleString("en-CA", { timeZone: "America/Toronto" })}`);
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

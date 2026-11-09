// Makes a shop free for good: active, never billed, no trial, Plan and billing hidden.
// Uses the same "original" flag as XSite's own shop (Forks), so the nightly job and Stripe leave it alone.
//   npm run shop:comp -- prg-speedfab
import pg from "pg";

const [slug] = process.argv.slice(2);
if (!slug) { console.error("Usage: npm run shop:comp -- shop-slug"); process.exit(1); }
const url = process.env.DATABASE_URL;
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
await db.connect();
try {
  const { rows } = await db.query("select id, name, status, source, stripe_subscription_id from shops where slug = $1", [slug.trim()]);
  const s = rows[0];
  if (!s) throw new Error(`No shop with the slug "${slug}".`);
  if (s.source === "original") { console.log(`${s.name} is already free. Nothing to do.`); }
  else {
    if (s.stripe_subscription_id) throw new Error(`${s.name} has a Stripe subscription. Cancel it in Stripe first so they aren't charged, then run this again.`);
    await db.query(`update shops set status = 'active', source = 'original', trial_ends_at = null,
                    read_only_since = null, past_due_since = null where id = $1`, [s.id]);
    console.log(`${s.name} (${slug}) is now free: active, never billed, no trial emails.`);
  }
} catch (e) {
  console.error("Stopped, nothing changed:", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}

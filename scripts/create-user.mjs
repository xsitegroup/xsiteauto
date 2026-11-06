// Usage: npm run user:add -- owner@example.com "Full Name" "a-strong-password" shop-slug
// Running it again for the same email resets that person's password.
// The shop is the 4th argument (or SHOP). New logins for trial shops are made in the app (Team).
import pg from "pg";
import bcrypt from "bcryptjs";

const [email, name, password, slugArg] = process.argv.slice(2);
if (!email || !password) { console.error('Usage: npm run user:add -- email "Full Name" password shop-slug'); process.exit(1); }
if (password.length < 8) { console.error("Use a password of at least 8 characters."); process.exit(1); }
const url = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
await client.connect();
const slug = (slugArg || process.env.SHOP || "").trim().toLowerCase();
if (!slug) { console.error('Give the shop slug: npm run user:add -- email "Full Name" password shop-slug'); process.exit(1); }
const { rows } = await client.query("select id, name from shops where slug = $1", [slug]);
if (!rows[0]) { console.error(`No shop "${slug}". Run npm run db:setup first, or give the shop's slug.`); process.exit(1); }
await client.query(
  `insert into users (email, name, password_hash, shop_id, role, email_verified_at) values (lower($1), $2, $3, $4, 'owner', now())
   on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash`,
  [email.trim(), name || "", await bcrypt.hash(password, 10), rows[0].id]
);
await client.end();
console.log(`Saved login for ${email} at ${rows[0].name}.`);

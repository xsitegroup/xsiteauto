// Makes a login an XSite admin account: it belongs to no shop and opens the /admin page.
//   npm run user:admin -- david@xsitegroup.ca
//       moves an existing login out of its shop (the shop keeps its other logins)
//   npm run user:admin -- someone@xsitegroup.ca "Full Name" "a-strong-password"
//       creates a new admin login
// The email must also be in SUPER_ADMINS in Vercel, or the login is refused.
import pg from "pg";
import bcrypt from "bcryptjs";

const [email, name, password] = process.argv.slice(2);
if (!email) { console.error('Usage: npm run user:admin -- email ["Full Name" "password"]'); process.exit(1); }
const url = process.env.DATABASE_URL;
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
await db.connect();
try {
  const { rows } = await db.query(
    "select u.id, u.email, u.shop_id, s.name as shop, s.slug from users u left join shops s on s.id = u.shop_id where lower(u.email) = lower($1)", [email.trim()]);
  const u = rows[0];
  if (!u) {
    if (!password || password.length < 10) throw new Error("No login with that email. To create one, give a name and a password of at least 10 characters.");
    await db.query("insert into users (email, name, password_hash, shop_id, role, email_verified_at) values (lower($1), $2, $3, null, 'admin', now())",
      [email.trim(), name || "", await bcrypt.hash(password, 10)]);
    console.log(`Created admin login ${email}.`);
  } else {
    if (u.shop_id) {
      const { rows: others } = await db.query("select email from users where shop_id = $1 and id <> $2 and role = 'owner'", [u.shop_id, u.id]);
      if (!others.length) throw new Error(`${u.email} is the only owner login at ${u.shop}. Add another owner there first (Team and logins).`);
      console.log(`${u.shop} keeps: ${others.map((o) => o.email).join(", ")}`);
    }
    await db.query("update users set shop_id = null, role = 'admin' where id = $1", [u.id]);
    if (password) await db.query("update users set password_hash = $2 where id = $1", [u.id, await bcrypt.hash(password, 10)]);
    console.log(`${u.email} is now an XSite admin login${u.shop ? ` (no longer part of ${u.shop})` : ""}. Same password. Sign in at app.xsiteauto.com.`);
  }
} catch (e) {
  console.error("Stopped, nothing changed:", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}

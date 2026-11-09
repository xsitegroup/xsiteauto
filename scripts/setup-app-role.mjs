// Creates (or re-keys) xsite_app, the database login the app should use. Unlike the Neon owner login,
// row-level security applies to it, so each shop only ever sees its own records.
//   npm run db:app-role
// Prints APP_DATABASE_URL. Put it in Vercel (xsiteauto-app > Settings > Environment Variables) and redeploy.
// Run again any time to rotate its password (then update Vercel again).
import pg from "pg";
import crypto from "node:crypto";

const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl) { console.error("DATABASE_URL is not set. Run `npx vercel env pull .env.local` first."); process.exit(1); }
const ssl = /localhost|127\.0\.0\.1/.test(ownerUrl) ? false : { rejectUnauthorized: false };
const ROLE = "xsite_app";
const pass = crypto.randomBytes(24).toString("hex");
const db = new pg.Client({ connectionString: ownerUrl, ssl });
await db.connect();
try {
  const exists = (await db.query("select 1 from pg_roles where rolname = $1", [ROLE])).rows[0];
  await db.query(`${exists ? "alter" : "create"} role ${ROLE} with login nosuperuser nobypassrls nocreatedb nocreaterole password '${pass}'`);
  await db.query(`grant usage on schema public to ${ROLE}`);
  await db.query(`grant select, insert, update, delete on all tables in schema public to ${ROLE}`);
  await db.query(`grant usage, select, update on all sequences in schema public to ${ROLE}`);
  await db.query(`grant execute on all functions in schema public to ${ROLE}`);
  await db.query(`alter default privileges in schema public grant select, insert, update, delete on tables to ${ROLE}`);
  await db.query(`alter default privileges in schema public grant usage, select, update on sequences to ${ROLE}`);
  console.log(`${exists ? "Re-keyed" : "Created"} login ${ROLE} (row-level security applies to it).`);

  const u = new URL(ownerUrl); u.username = ROLE; u.password = pass;
  const appUrl = u.toString();

  // Prove it: as xsite_app, a shop must see only its own settings.
  const app = new pg.Client({ connectionString: appUrl, ssl });
  await app.connect();
  try {
    const r = (await app.query("select rolbypassrls from pg_roles where rolname = current_user")).rows[0];
    const shops = (await app.query("select id, slug from shops order by created_at")).rows;
    let ok = !r.rolbypassrls;
    for (const s of shops) {
      await app.query("begin");
      await app.query("select set_config('app.shop_id', $1, true), set_config('app.admin', '', true)", [s.id]);
      const other = (await app.query("select count(*)::int n from settings where shop_id <> $1", [s.id])).rows[0].n
                  + (await app.query("select count(*)::int n from customers where shop_id <> $1", [s.id])).rows[0].n;
      await app.query("rollback");
      console.log(`  ${s.slug.padEnd(28)} ${other === 0 ? "sees only its own records" : `SEES ${other} OTHER-SHOP ROWS`}`);
      if (other) ok = false;
    }
    if (!ok) throw new Error("Isolation check failed. Do not switch the app over yet.");
  } finally { await app.end(); }

  console.log("\nIsolation check passed. Add this to Vercel (xsiteauto-app, Production and Preview) and to .env.local:");
  console.log("Keep it private: don't paste or screenshot it into chats or email.\n");
  console.log(`APP_DATABASE_URL=${appUrl}\n`);
} catch (e) {
  console.error("Stopped:", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}

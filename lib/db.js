import pg from "pg";

// The app connects as xsite_app, a login that row-level security applies to. DATABASE_URL (the Neon owner)
// bypasses row-level security, so it is kept for the admin scripts only. See scripts/setup-app-role.mjs.
const url = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
const local = !url || /localhost|127\.0\.0\.1/.test(url);

// One pool per server instance (reused across requests on Vercel).
const pool = globalThis.__xaPool || new pg.Pool({
  connectionString: url,
  ssl: local ? false : { rejectUnauthorized: false },
  max: 5,
});
globalThis.__xaPool = pool;

// Tables shared by every shop: shops, shop_domains, users, signups, tokens.
// Shop tables (customers, jobs, ...) return nothing through this: use inShop().
export const query = (text, params) => pool.query(text, params);

// Runs fn(q) in one transaction that can only see and change one shop's records.
// Row-level security in the database enforces it, so a missed "where" can't leak another shop's data.
export async function inShop(shopId, fn, { admin = false } = {}) {
  if (!shopId && !admin) throw new Error("inShop: no shop");
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.shop_id', $1, true), set_config('app.admin', $2, true)", [shopId || "", admin ? "on" : ""]);
    const out = await fn((text, params) => c.query(text, params));
    await c.query("commit");
    return out;
  } catch (e) {
    try { await c.query("rollback"); } catch {}
    throw e;
  } finally {
    c.release();
  }
}

// The system itself, across every shop (signup, nightly trial job, public photos).
export const asSystem = (fn) => inShop(null, fn, { admin: true });

// Collection name the page uses -> table that stores it.
export const TABLES = { customers: "customers", jobs: "jobs", cash: "cash_days", settings: "settings", requests: "requests" };

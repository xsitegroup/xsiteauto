// Read-only check: why a shop's public page shows the wrong name or phone. Changes nothing.
//   node --env-file=.env.local scripts/diagnose-shop.mjs prg-speedfab
import pg from "pg";
const slug = process.argv[2];
const url = process.env.DATABASE_URL;
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
await db.connect();
try {
  const r = await db.query("select current_user u, rolsuper, rolbypassrls from pg_roles where rolname = current_user");
  console.log("DB login:", r.rows[0]);
  const { rows: [shop] } = await db.query("select id, name, phone, status, source from shops where slug = $1", [slug]);
  if (!shop) throw new Error("no shop " + slug);
  console.log("Shop row:", { name: shop.name, phone: shop.phone, status: shop.status, source: shop.source });
  const { rows: own } = await db.query("select id, data->>'shopName' shop_name, data->>'phone' phone from settings where shop_id = $1 and id in ('site','shop')", [shop.id]);
  console.log("Its own settings:", own);
  await db.query("begin");
  await db.query("select set_config('app.shop_id', $1, true), set_config('app.admin', '', true)", [shop.id]);
  const { rows: seen } = await db.query("select s.id, x.slug, s.data->>'shopName' shop_name, s.data->>'phone' phone from settings s join shops x on x.id = s.shop_id where s.id in ('site','shop')");
  await db.query("rollback");
  console.log(`Rows the app sees for this shop: ${seen.length} (should be 2)`);
  for (const s of seen) console.log("  ", s);
  console.log(seen.some((s) => s.slug !== slug) ? "\nRESULT: OTHER SHOPS' ROWS ARE VISIBLE. Row-level security is being bypassed." : "\nRESULT: isolation OK. The wrong name/phone is in this shop's own settings.");
} catch (e) { console.error("Stopped:", e.message); process.exitCode = 1; }
finally { await db.end(); }

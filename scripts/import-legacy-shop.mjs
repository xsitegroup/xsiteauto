// Moves a shop from its own older single-shop app (the original Forks Auto Repair layout) into XSite Auto.
// The old database is only read from; nothing in it is changed or deleted.
//
//   npm run shop:import-legacy -- --from ..\forks-auto-repair\.env.local
//       shows what would be moved (nothing is written)
//   npm run shop:import-legacy -- --from ..\forks-auto-repair\.env.local --yes
//       moves it
//   ... --yes --replace
//       deletes the shop this script made earlier and moves it again (for a fresh copy just before the switch)
//
// --from is the old app's .env.local (its DATABASE_URL is used), or pass --source-url "postgres://...".
// Optional: --slug forks-auto-repair  --domains forksautorepair.ca,www.forksautorepair.ca,shop.forksautorepair.ca
// The shop is created as XSite's own ("original"): active, never billed, no trial.
import pg from "pg";
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const has = (name) => args.includes(name);
const GO = has("--yes"), REPLACE = has("--replace");
const SLUG = (opt("--slug") || "forks-auto-repair").toLowerCase();
const DOMAINS = (opt("--domains") || "forksautorepair.ca,www.forksautorepair.ca,shop.forksautorepair.ca")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function sourceUrl() {
  if (opt("--source-url")) return opt("--source-url");
  const file = opt("--from");
  if (!file) return null;
  const text = await readFile(file, "utf8");
  const m = /^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m.exec(text);
  return m ? m[1].trim() : null;
}

const target = process.env.DATABASE_URL;
const source = await sourceUrl();
if (!target) { console.error("DATABASE_URL (XSite Auto) is not set. Run `npx vercel env pull .env.local` in this folder first."); process.exit(1); }
if (!source) { console.error("Tell me where the old database is: --from ..\\forks-auto-repair\\.env.local"); process.exit(1); }
if (source === target) { console.error("The old and new databases are the same. Check --from."); process.exit(1); }

const ssl = (u) => (/localhost|127\.0\.0\.1/.test(u) ? false : { rejectUnauthorized: false });
const src = new pg.Client({ connectionString: source, ssl: ssl(source) });
const dst = new pg.Client({ connectionString: target, ssl: ssl(target) });
await src.connect();
await dst.connect();

const tableExists = async (c, t) => (await c.query("select to_regclass($1) as r", [t])).rows[0].r !== null;
const read = async (t, cols = "*") => ((await tableExists(src, t)) ? (await src.query(`select ${cols} from ${t}`)).rows : []);

try {
  // ---------- read the old shop (read only) ----------
  await src.query("set default_transaction_read_only = on");
  if (await tableExists(src, "shops")) throw new Error("The --from database already has a shops table: it isn't an old single-shop database.");
  const data = {};
  for (const t of ["customers", "jobs", "cash_days", "settings", "requests"]) data[t] = await read(t);
  const users = await read("users");
  const log = await read("change_log");
  const photos = await read("photos");
  const shopSet = data.settings.find((r) => r.id === "shop")?.data || {};
  const name = shopSet.shopName || "Forks Auto Repair";

  console.log(`Old database: ${name}`);
  for (const t of Object.keys(data)) console.log(`  ${t.padEnd(12)} ${data[t].length}`);
  console.log(`  ${"logins".padEnd(12)} ${users.length}  (${users.map((u) => u.email).join(", ")})`);
  console.log(`  ${"change_log".padEnd(12)} ${log.length}`);
  console.log(`  ${"photos".padEnd(12)} ${photos.length}`);

  // ---------- check the new database ----------
  await dst.query("set app.admin = 'on'");
  const { rows: existing } = await dst.query("select id, name, source from shops where slug = $1", [SLUG]);
  if (existing[0] && !(REPLACE && existing[0].source === "original"))
    throw new Error(existing[0].source === "original"
      ? `"${SLUG}" is already in XSite Auto. Add --replace to delete it and copy it again.`
      : `The address "${SLUG}" belongs to another shop (${existing[0].name}). Pick another with --slug.`);
  const emails = users.map((u) => u.email.toLowerCase());
  const { rows: clash } = await dst.query(
    "select u.email, s.slug from users u left join shops s on s.id = u.shop_id where lower(u.email) = any($1) and (s.slug is distinct from $2)", [emails, SLUG]);
  if (clash.length) throw new Error(`These logins already belong to another XSite Auto shop: ${clash.map((c) => `${c.email} (${c.slug || "no shop"})`).join(", ")}. Delete or rename them first.`);
  const { rows: hostClash } = await dst.query(
    "select d.host, s.slug from shop_domains d join shops s on s.id = d.shop_id where d.host = any($1) and s.slug <> $2", [DOMAINS, SLUG]);
  if (hostClash.length) throw new Error(`These addresses already point at another shop: ${hostClash.map((h) => `${h.host} (${h.slug})`).join(", ")}.`);
  if (photos.length) {
    const { rows: pClash } = await dst.query(
      "select p.id from photos p join shops s on s.id = p.shop_id where p.id = any($1) and s.slug <> $2", [photos.map((p) => p.id), SLUG]);
    if (pClash.length) throw new Error(`${pClash.length} photo id(s) already used by another shop.`);
  }

  console.log(`\nNew XSite Auto shop: ${name} (${SLUG}), original shop, never billed`);
  console.log(`  Addresses: ${DOMAINS.join(", ")}`);
  if (existing[0]) console.log(`  --replace: the copy made earlier is deleted first and made again.`);
  if (!GO) {
    console.log(`\nNothing written. To move it: npm run shop:import-legacy -- --from <old .env.local> --yes${existing[0] ? " --replace" : ""}`);
  } else {
    // ---------- write it, all or nothing ----------
    await dst.query("begin");
    if (existing[0]) await dst.query("delete from shops where id = $1", [existing[0].id]);
    const { rows: made } = await dst.query(
      `insert into shops (slug, name, status, country, region, timezone, phone, website_url, source, converted_at)
       values ($1, $2, 'active', 'CA', 'ON', 'America/Toronto', $3, $4, 'original', now()) returning id`,
      [SLUG, name, shopSet.phone || null, DOMAINS.find((d) => !d.startsWith("shop.") && !d.startsWith("www.")) ? `https://${DOMAINS.find((d) => !d.startsWith("shop.") && !d.startsWith("www."))}` : null]);
    const shopId = made[0].id;

    // Settings: keep everything; fill the website from Forks' starter content where it relied on it,
    // and add the time zone and tax confirmation the old app assumed.
    const defaults = JSON.parse(await readFile(new URL("../lib/site-defaults.json", import.meta.url), "utf8"));
    for (const r of data.settings) {
      if (r.id === "site") {
        const site = { ...defaults, ...(r.data || {}) };
        for (const k of ["googlePlaceId", "googleReviewsUrl", "facebookUrl"]) if (!site[k]) site[k] = defaults[k];
        for (const k of ["proof", "specialties", "beforeAfter", "faqs", "featuredReviews"]) if (!Array.isArray(site[k])) site[k] = defaults[k];
        if (!site.banner || typeof site.banner !== "object") site.banner = defaults.banner;
        r.data = site;
      }
      if (r.id === "shop") r.data = { timeZone: "America/Toronto", ...r.data, taxConfirmed: true };
    }

    for (const t of ["customers", "jobs", "cash_days", "settings"]) {
      for (const r of data[t])
        await dst.query(`insert into ${t} (shop_id, id, data, updated_by, updated_at) values ($1, $2, $3, $4, $5)`,
          [shopId, r.id, r.data, r.updated_by ?? null, r.updated_at ?? new Date()]);
    }
    for (const r of data.requests)
      await dst.query("insert into requests (shop_id, id, data, ip_hash, created_at, updated_by, updated_at) values ($1, $2, $3, $4, $5, $6, $7)",
        [shopId, r.id, r.data, r.ip_hash ?? null, r.created_at ?? new Date(), r.updated_by ?? null, r.updated_at ?? new Date()]);
    for (const u of users)
      await dst.query(
        `insert into users (email, name, password_hash, created_at, shop_id, role, email_verified_at) values ($1, $2, $3, $4, $5, 'owner', now())
         on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash, shop_id = excluded.shop_id, role = 'owner'`,
        [u.email, u.name || "", u.password_hash, u.created_at ?? new Date(), shopId]);
    for (const l of log)
      await dst.query("insert into change_log (shop_id, collection, record_id, action, data, changed_by, changed_at) values ($1, $2, $3, $4, $5, $6, $7)",
        [shopId, l.collection, l.record_id, l.action, l.data, l.changed_by, l.changed_at]);
    for (const p of photos)
      await dst.query("insert into photos (id, shop_id, mime, bytes, uploaded_by, uploaded_at) values ($1, $2, $3, $4, $5, $6)",
        [p.id, shopId, p.mime, p.bytes, p.uploaded_by ?? null, p.uploaded_at ?? new Date()]);
    for (const host of DOMAINS)
      await dst.query("insert into shop_domains (host, shop_id, kind) values ($1, $2, $3) on conflict (host) do update set shop_id = excluded.shop_id, kind = excluded.kind",
        [host, shopId, host.startsWith("shop.") || host.startsWith("app.") ? "app" : "site"]);

    // Check the copy before keeping it.
    for (const [t, want] of [["customers", data.customers.length], ["jobs", data.jobs.length], ["cash_days", data.cash_days.length],
      ["settings", data.settings.length], ["requests", data.requests.length], ["change_log", log.length], ["photos", photos.length]]) {
      const { rows } = await dst.query(`select count(*)::int n from ${t} where shop_id = $1`, [shopId]);
      if (rows[0].n !== want) throw new Error(`${t}: copied ${rows[0].n}, expected ${want}. Nothing was kept.`);
    }
    await dst.query("commit");
    console.log(`\nMoved. ${name} is now in XSite Auto as "${SLUG}", with ${users.length} login(s) and the same passwords.`);
    console.log("Next: point the domains at the XSite Auto project in Vercel.");
  }
} catch (e) {
  try { await dst.query("rollback"); } catch {}
  console.error("\nStopped, nothing changed:", e.message);
  process.exitCode = 1;
} finally {
  await src.end();
  await dst.end();
}

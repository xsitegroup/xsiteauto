// Creates or upgrades the XSite Auto database. Safe to run more than once.
//
//   npm run db:setup
//
// Upgrading an older single-shop database (the original Forks Auto Repair layout):
// every existing record, login and change-log entry is moved into one shop. Set these first:
//   LEGACY_SHOP_SLUG     e.g. forks-auto-repair (defaults to the shop name)
//   LEGACY_SHOP_DOMAINS  e.g. forksautorepair.ca,www.forksautorepair.ca,shop.forksautorepair.ca
// Take a Neon branch (backup) before running it against the live database.
import pg from "pg";
import { readFile } from "node:fs/promises";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set. Run `vercel env pull .env.local` first."); process.exit(1); }
const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
await client.connect();
const q = (t, p) => client.query(t, p);

// One shop's records. Tables keyed by (shop_id, id) and tables with their own serial or random id.
const KEYED = ["customers", "jobs", "cash_days", "settings", "requests", "imports"];
const OWN_ID = ["change_log", "photos", "lookups"];
const SCOPED = [...KEYED, ...OWN_ID];

const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "") || "shop";

try {
  await q("set app.admin = 'on'");   // the setup script works across every shop
  await q(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));

  // ---------- upgrade an older single-shop database ----------
  for (const t of SCOPED) await q(`alter table ${t} add column if not exists shop_id uuid`);
  const counts = {};
  for (const t of [...SCOPED, "users"]) {
    const { rows } = await q(`select count(*)::int as n from ${t} where shop_id is null`);
    counts[t] = rows[0].n;
  }
  const waiting = Object.values(counts).reduce((a, b) => a + b, 0);
  if (waiting > 0) {
    const { rows: st } = await q("select data from settings where id = 'shop' and shop_id is null");
    const name = st[0]?.data?.shopName || "Forks Auto Repair";
    const slug = slugify(process.env.LEGACY_SHOP_SLUG || name);
    let { rows: found } = await q("select id from shops where slug = $1", [slug]);
    if (!found[0]) {
      ({ rows: found } = await q(
        `insert into shops (slug, name, status, country, region, timezone, source, converted_at)
         values ($1, $2, 'active', 'CA', 'ON', 'America/Toronto', 'original', now()) returning id`, [slug, name]));
      console.log(`Created shop "${name}" (${slug}).`);
    }
    const shopId = found[0].id;

    // The website used to fill gaps from Forks' starter content at display time. Save that into
    // the shop's own record now, so the public site looks exactly the same after the upgrade.
    const { rows: siteRows } = await q("select data from settings where id = 'site' and shop_id is null");
    if (siteRows[0]) {
      const defaults = JSON.parse(await readFile(new URL("../lib/site-defaults.json", import.meta.url), "utf8"));
      const saved = siteRows[0].data || {};
      const site = { ...defaults, ...saved };
      for (const k of ["googlePlaceId", "googleReviewsUrl", "facebookUrl"]) if (!site[k]) site[k] = defaults[k];
      for (const k of ["proof", "specialties", "beforeAfter", "faqs", "featuredReviews"]) if (!Array.isArray(site[k])) site[k] = defaults[k];
      if (!site.banner || typeof site.banner !== "object") site.banner = defaults.banner;
      await q("update settings set data = $1 where id = 'site' and shop_id is null", [site]);
    }
    // Forks had no time zone or tax-confirmed setting; keep today's behaviour.
    await q(`update settings set data = data || jsonb_build_object('timeZone', coalesce(data->>'timeZone','America/Toronto'), 'taxConfirmed', true)
             where id = 'shop' and shop_id is null`);

    for (const t of [...SCOPED, "users"]) await q(`update ${t} set shop_id = $1 where shop_id is null`, [shopId]);
    for (const host of (process.env.LEGACY_SHOP_DOMAINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      await q("insert into shop_domains (host, shop_id, kind) values ($1, $2, $3) on conflict (host) do update set shop_id = excluded.shop_id, kind = excluded.kind",
        [host, shopId, host.startsWith("shop.") || host.startsWith("app.") ? "app" : "site"]);
    }
    console.log(`Moved ${waiting} existing record(s) into "${slug}":`, Object.entries(counts).filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(", "));
  }

  // ---------- columns, keys and row-level security on every shop table ----------
  for (const t of SCOPED) {
    await q(`alter table ${t} alter column shop_id set not null`);
    await q(`alter table ${t} alter column shop_id set default app_shop()`);
    const { rows: fk } = await q(
      `select 1 from pg_constraint where conrelid = $1::regclass and contype = 'f' and conkey = array[(select attnum from pg_attribute where attrelid = $1::regclass and attname = 'shop_id')]::smallint[]`, [t]);
    if (!fk[0]) await q(`alter table ${t} add foreign key (shop_id) references shops on delete cascade`);
    if (KEYED.includes(t)) {
      const { rows: pk } = await q(
        `select c.conname, array_agg(a.attname::text order by k.ord) as cols
           from pg_constraint c cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
          where c.conrelid = $1::regclass and c.contype = 'p' group by c.conname`, [t]);
      if (!pk[0] || pk[0].cols.join(",") !== "shop_id,id") {
        if (pk[0]) await q(`alter table ${t} drop constraint ${pk[0].conname}`);
        await q(`alter table ${t} add primary key (shop_id, id)`);
      }
    }
    await q(`create index if not exists ${t}_shop on ${t} (shop_id)`);
    await q(`alter table ${t} enable row level security`);
    await q(`alter table ${t} force row level security`);
    await q(`drop policy if exists shop_rows on ${t}`);
    await q(`create policy shop_rows on ${t} using (app_admin() or shop_id = app_shop()) with check (app_admin() or shop_id = app_shop())`);
  }
  console.log("Database ready.");
} catch (e) {
  console.error("Setup stopped:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

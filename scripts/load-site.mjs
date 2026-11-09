// Loads a shop's public website content from a JSON file, uploads any "file:" photos, and links its domains.
// The shop can then edit everything in the Shop Book (Website), the same as Forks.
//   npm run shop:load-site -- prg-speedfab "..\prg-speedfab\prg-site.json"
// JSON: { "site": {...website fields...}, "keep": [fields to leave as the shop set them], "domains": ["example.ca"] }
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [slug, file] = process.argv.slice(2);
if (!slug || !file) { console.error('Usage: npm run shop:load-site -- shop-slug "path\\to\\site.json"'); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(file, "utf8"));
const dir = path.dirname(path.resolve(file));
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const url = process.env.DATABASE_URL;
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
await db.connect();
try {
  const { rows: [shop] } = await db.query("select id, name from shops where slug = $1", [slug]);
  if (!shop) throw new Error(`No shop with the slug "${slug}".`);
  await db.query("begin");
  const uploaded = new Map();
  const photo = async (v) => {
    if (typeof v !== "string" || !v.startsWith("file:")) return v;
    const p = path.resolve(dir, v.slice(5));
    if (uploaded.has(p)) return uploaded.get(p);
    const mime = MIME[path.extname(p).toLowerCase()];
    if (!mime) throw new Error(`Not a JPEG, PNG or WebP photo: ${p}`);
    const bytes = fs.readFileSync(p);
    if (bytes.length > 3 * 1024 * 1024) throw new Error(`Over 3 MB, shrink it first: ${p}`);
    const id = crypto.randomBytes(10).toString("hex") + "." + EXT[mime];
    await db.query("insert into photos (id, shop_id, mime, bytes, uploaded_by) values ($1, $2, $3, $4, 'load-site')", [id, shop.id, mime, bytes]);
    uploaded.set(p, `/photos/${id}`);
    return `/photos/${id}`;
  };
  const walk = async (v) => Array.isArray(v) ? Promise.all(v.map(walk))
    : v && typeof v === "object" ? Object.fromEntries(await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await walk(x)])))
    : photo(v);
  const incoming = await walk(spec.site || {});
  const { rows: [cur] } = await db.query("select data from settings where shop_id = $1 and id = 'site'", [shop.id]);
  const old = cur?.data || {};
  const next = { ...old, ...incoming };
  for (const k of spec.keep || []) if (old[k] !== undefined) next[k] = old[k];
  await db.query(`insert into settings (shop_id, id, data, updated_by) values ($1, 'site', $2, 'load-site')
                  on conflict (shop_id, id) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = now()`, [shop.id, next]);
  for (const host of spec.domains || []) {
    const h = host.toLowerCase().replace(/^www\./, "");
    const { rows: [taken] } = await db.query("select s.slug from shop_domains d join shops s on s.id = d.shop_id where d.host = $1", [h]);
    if (taken && taken.slug !== slug) throw new Error(`${h} already belongs to ${taken.slug}.`);
    await db.query("insert into shop_domains (host, shop_id, kind) values ($1, $2, 'site') on conflict (host) do nothing", [h]);
  }
  await db.query("commit");
  console.log(`${shop.name}: website content loaded (${uploaded.size} photos), ${next.published ? "published" : "not published"}.`);
  if (spec.domains?.length) console.log(`Domains linked: ${spec.domains.join(", ")} (www works too). Now add them to the xsiteauto-app project in Vercel.`);
  console.log("Edit it any time in the Shop Book under Website.");
} catch (e) {
  try { await db.query("rollback"); } catch {}
  console.error("Stopped, nothing changed:", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}

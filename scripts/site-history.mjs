// List earlier saved versions of the website settings, and put one back.
//   node --env-file=.env.local scripts/site-history.mjs           list the last 30 versions
//   node --env-file=.env.local scripts/site-history.mjs 123       put version 123 back
//   node --env-file=.env.local scripts/site-history.mjs about     show every saved version of the About story
//   node --env-file=.env.local scripts/site-history.mjs photos    list uploaded pictures the website isn't using
//   node --env-file=.env.local scripts/site-history.mjs photos add   add those pictures to the website's photo gallery
import pg from "pg";
import { useShop } from "./use-shop.mjs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set. Run `vercel env pull .env.local` first."); process.exit(1); }
const db = new pg.Client({ connectionString: url });
await db.connect();
await useShop(db);

const pick = process.argv[2];
const n = (a) => (Array.isArray(a) ? a.length : 0);
const summary = (d) => {
  if (!d) return "(deleted)";
  const open = (d.hours || []).filter((h) => !h.closed).map((h) => h.day.slice(0, 3)).join(",");
  const pics = n(d.photos) + (d.aboutPhoto ? 1 : 0) + (d.heroPhoto ? 1 : 0)
    + (d.specialties || []).filter((s) => s.photo).length
    + (d.beforeAfter || []).reduce((t, j) => t + (j.before ? 1 : 0) + (j.after ? 1 : 0), 0);
  return `${pics} pictures, ${n(d.services)} services, open ${open || "none"}, ${d.published ? "published" : "not published"}, about ${(d.about || "").length} chars`;
};

const used = (d) => JSON.stringify(d || {});
if (pick === "about") {
  const { rows } = await db.query(
    "select id, data, changed_at from change_log where collection='settings' and record_id='site' and data ? 'about' order by id desc");
  const seen = new Set();
  for (const r of rows) {
    const t = (r.data.about || "").trim(), title = r.data.aboutTitle || "About";
    if (!t || seen.has(t)) continue;
    seen.add(t);
    console.log(`\n===== #${r.id}  ${new Date(r.changed_at).toLocaleString("en-CA", { timeZone: "America/Toronto" })}  (${title}${r.data.credentials ? " | " + r.data.credentials : ""}) =====\n${t}`);
  }
  if (!seen.size) console.log("No About story has ever been saved.");
} else if (pick === "photos") {
  const { rows: cur } = await db.query("select data from settings where id='site'");
  const site = cur[0]?.data || {};
  const { rows } = await db.query("select id, uploaded_by, uploaded_at from photos order by uploaded_at");
  const loose = rows.filter((p) => !used(site).includes(`/photos/${p.id}`));
  if (!loose.length) console.log("Every uploaded picture is already on the website.");
  for (const p of loose) console.log(`/photos/${p.id}  ${new Date(p.uploaded_at).toLocaleString("en-CA", { timeZone: "America/Toronto" })}  ${p.uploaded_by || ""}`);
  if (loose.length && process.argv[3] === "add") {
    site.photos = [...(Array.isArray(site.photos) ? site.photos : []), ...loose.map((p) => ({ url: `/photos/${p.id}`, caption: "" }))];
    await db.query("update settings set data=$1, updated_by='restore', updated_at=now() where id='site'", [site]);
    await db.query("insert into change_log (collection, record_id, action, data, changed_by) values ('settings','site','restore',$1,'restore')", [site]);
    console.log(`Added ${loose.length} picture(s) to the photo gallery. Move them to the right spots in the Website tab.`);
  } else if (loose.length) console.log(`\n${loose.length} picture(s) not on the website. To add them all to the gallery:  node --env-file=.env.local scripts/site-history.mjs photos add`);
} else if (!pick) {
  const { rows } = await db.query(
    "select id, action, data, changed_by, changed_at from change_log where collection='settings' and record_id='site' order by id desc limit 30");
  if (!rows.length) console.log("No saved versions found.");
  for (const r of rows) {
    const when = new Date(r.changed_at).toLocaleString("en-CA", { timeZone: "America/Toronto" });
    console.log(`#${r.id}  ${when}  ${r.changed_by || ""}\n      ${summary(r.data)}`);
  }
  console.log("\nTo put one back:  node --env-file=.env.local scripts/site-history.mjs <number>");
} else {
  const { rows } = await db.query(
    "select data from change_log where id=$1 and collection='settings' and record_id='site'", [Number(pick)]);
  if (!rows[0] || !rows[0].data) { console.error(`Version #${pick} not found.`); process.exit(1); }
  const data = rows[0].data;
  await db.query(
    `insert into settings (id, data, updated_by, updated_at) values ('site', $1, 'restore', now())
     on conflict (id) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = now()`, [data]);
  await db.query("insert into change_log (collection, record_id, action, data, changed_by) values ('settings','site','restore',$1,'restore')", [data]);
  console.log(`Put back version #${pick}: ${summary(data)}`);
  console.log("Open the Shop Book, go to Website and tap Save website once so the public site refreshes.");
}
await db.end();

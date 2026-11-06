// Quick health check: how many records are in each table, and the most recent changes.
//   node --env-file=.env.local scripts/check.mjs
import pg from "pg";
import { useShop } from "./use-shop.mjs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set. Run `vercel env pull .env.local` first."); process.exit(1); }
const db = new pg.Client({ connectionString: url });
await db.connect();
await useShop(db);
const when = (t) => (t ? new Date(t).toLocaleString("en-CA", { timeZone: "America/Toronto" }) : "never");

console.log("Records now:");
for (const t of ["customers", "jobs", "cash_days", "settings", "requests", "photos", "users"]) {
  try {
    const { rows } = await db.query(`select count(*)::int n from ${t}`);
    console.log(`  ${t.padEnd(10)} ${rows[0].n}`);
  } catch { console.log(`  ${t.padEnd(10)} (missing)`); }
}
const { rows: s } = await db.query("select data, updated_by, updated_at from settings where id='site'");
if (s[0]) {
  const d = s[0].data || {};
  console.log(`\nWebsite settings: last saved ${when(s[0].updated_at)} by ${s[0].updated_by || "?"}`);
  console.log(`  ${(d.photos || []).length} gallery photos, about photo ${d.aboutPhoto ? "yes" : "no"}, ${(d.services || []).length} services, story ${(d.about || "").length} chars, published ${d.published ? "yes" : "no"}`);
} else console.log("\nWebsite settings: none saved");

const { rows } = await db.query(
  "select id, collection, record_id, action, changed_by, changed_at from change_log order by id desc limit 25");
console.log("\nLast 25 changes:");
for (const r of rows) console.log(`  #${r.id}  ${when(r.changed_at)}  ${r.action.padEnd(7)} ${r.collection}/${r.record_id}  ${r.changed_by || ""}`);
const { rows: del } = await db.query("select collection, count(*)::int n from change_log where action='delete' group by collection");
if (del.length) console.log("\nDeletes ever recorded: " + del.map((d) => `${d.collection} ${d.n}`).join(", "));
await db.end();

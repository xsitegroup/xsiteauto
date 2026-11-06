import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { inShop } from "@/lib/db";
import { signedIn } from "@/lib/guard";
import { plan } from "@/lib/qb-import";
import { digits10 } from "@/lib/site";

// Step 2: save the import as one batch, so it can be undone for 7 days.
const s = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
const id = (p) => p + Date.now().toString(36) + randomBytes(3).toString("hex");

export async function POST(req) {
  const g = await signedIn({ write: true });
  if (g.error) return g.error;
  const b = await req.json().catch(() => null);
  if (!b || !Array.isArray(b.rows) || b.rows.length > 5000) return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
  // Only the cleaned fields come back from the page; check them again.
  const cands = b.rows.map((r) => ({
    row: +r.row || 0, name: s(r.name, 100), phone: digits10(r.phone) ? s(r.phone, 20) : "", email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s(r.email, 120)) ? s(r.email, 120).toLowerCase() : "",
    street: s(r.street, 120), city: s(r.city, 60), postal: s(r.postal, 10), company: s(r.company, 80), notes: s(r.notes, 500),
    balance: Math.max(0, Math.round((+r.balance || 0) * 100) / 100), inactive: !!r.inactive,
    ...(r.action === "skip" ? { skip: s(r.reason, 60) || "Skipped" } : {}),
  })).filter((c) => c.name);
  const balances = !!b.balances;
  const now = new Date().toISOString(), today = now.slice(0, 10);

  const result = await inShop(g.shop.id, async (q) => {
    const existing = (await q("select data from customers")).rows.map((r) => r.data);
    const rows = plan(cands, existing, { skipInactive: b.skipInactive !== false, merge: b.merge !== false });
    const impId = id("imp-");
    const created = [], merged = [], jobs = [];
    const log = (collection, recordId, data) => q("insert into change_log (collection, record_id, action, data, changed_by) values ($1,$2,'save',$3,$4)", [collection, recordId, data, g.user.email + " (QuickBooks import)"]);
    for (const r of rows) {
      if (r.action === "new") {
        const cid = id("c");
        const notes = [r.company && r.company !== r.name ? `Company: ${r.company}` : "", r.notes].filter(Boolean).join("\n");
        const doc = { id: cid, name: r.name, phone: r.phone, email: r.email, street: r.street, city: r.city, postal: r.postal, notes, vehicles: [], created: now, importId: impId, source: "QuickBooks" };
        await q("insert into customers (id, data, updated_by) values ($1, $2, $3)", [cid, doc, g.user.email]);
        await log("customers", cid, doc);
        created.push(cid); r.cid = cid;
      } else if (r.action === "merge") {
        const { rows: cur } = await q("select data from customers where id = $1", [r.into]);
        const before = cur[0]?.data; if (!before) continue;
        const after = { ...before };
        for (const k of ["phone", "email", "street", "city", "postal"]) if (!String(after[k] || "").trim() && r[k]) after[k] = r[k];
        if (JSON.stringify(after) !== JSON.stringify(before)) {
          after.updated = now;
          await q("update customers set data = $2, updated_by = $3, updated_at = now() where id = $1", [r.into, after, g.user.email]);
          await log("customers", r.into, after);
          merged.push({ id: r.into, before });
        }
        r.cid = r.into;
      }
      if (balances && r.cid && r.balance > 0) {
        const jid = id("ob");
        const job = { id: jid, ro: "QB", customerId: r.cid, date: today, status: "done", opening: true, parts: r.balance, hstRate: 0, labourHours: 0, payments: [],
          vehicle: "", concern: "Opening balance from QuickBooks", importId: impId, created: now };
        await q("insert into jobs (id, data, updated_by) values ($1, $2, $3)", [jid, job, g.user.email]);
        await log("jobs", jid, job);
        jobs.push(jid);
      }
    }
    const counts = { new: created.length, merged: merged.length, skipped: rows.filter((r) => r.action === "skip").length, balances: jobs.length };
    await q("insert into imports (id, data, created_by) values ($1, $2, $3)", [impId, { source: "QuickBooks", file: s(b.file, 120), created, merged, jobs, counts }, g.user.email]);
    return { id: impId, counts };
  });
  return NextResponse.json({ ok: true, ...result });
}

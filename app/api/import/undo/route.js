import { NextResponse } from "next/server";
import { inShop } from "@/lib/db";
import { signedIn } from "@/lib/guard";

// Undo an import from the last 7 days: removes the customers it added (unless they've since been booked),
// puts merged customers back as they were, and removes any opening-balance lines it made.
export async function POST(req) {
  const g = await signedIn({ write: true });
  if (g.error) return g.error;
  const { id } = await req.json().catch(() => ({}));
  const out = await inShop(g.shop.id, async (q) => {
    const { rows } = await q("select data from imports where id = $1 and created_at > now() - interval '7 days'", [String(id || "")]);
    const imp = rows[0]?.data;
    if (!imp || imp.undone) return { error: "That import can't be undone any more." };
    const who = g.user.email + " (undo QuickBooks import)";
    const log = (c, rid, action, data) => q("insert into change_log (collection, record_id, action, data, changed_by) values ($1,$2,$3,$4,$5)", [c, rid, action, data, who]);
    for (const jid of imp.jobs || []) { const r = await q("delete from jobs where id = $1 returning data", [jid]); if (r.rows[0]) await log("jobs", jid, "delete", r.rows[0].data); }
    let kept = 0, removed = 0;
    for (const cid of imp.created || []) {
      const { rows: used } = await q("select 1 from jobs where data->>'customerId' = $1 limit 1", [cid]);
      if (used[0]) { kept++; continue; }
      const r = await q("delete from customers where id = $1 returning data", [cid]);
      if (r.rows[0]) { removed++; await log("customers", cid, "delete", r.rows[0].data); }
    }
    for (const m of imp.merged || []) {
      await q("update customers set data = $2, updated_by = $3, updated_at = now() where id = $1", [m.id, m.before, g.user.email]);
      await log("customers", m.id, "save", m.before);
    }
    await q("update imports set data = data || '{\"undone\": true}'::jsonb where id = $1", [id]);
    return { removed, kept, restored: (imp.merged || []).length };
  });
  if (out.error) return NextResponse.json(out, { status: 410 });
  return NextResponse.json({ ok: true, ...out });
}

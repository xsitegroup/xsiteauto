import { NextResponse } from "next/server";
import { inShop, TABLES } from "@/lib/db";
import { signedIn } from "@/lib/guard";

const ID = /^[A-Za-z0-9_\-.~:@+]{1,120}$/;

async function target(params) {
  const { collection, id } = await params;
  const table = TABLES[collection];
  if (!table || !ID.test(id)) return null;
  return { collection, id, table };
}

export async function PUT(req, { params }) {
  const g = await signedIn({ write: true });
  if (g.error) return g.error;
  const t = await target(params);
  if (!t) return NextResponse.json({ error: "Unknown record." }, { status: 400 });
  const data = await req.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) return NextResponse.json({ error: "Bad record." }, { status: 400 });
  if (JSON.stringify(data).length > 200_000) return NextResponse.json({ error: "Record too large." }, { status: 413 });
  await inShop(g.shop.id, async (q) => {
    await q(
      `insert into ${t.table} (id, data, updated_by, updated_at) values ($1, $2, $3, now())
       on conflict (shop_id, id) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = now()`,
      [t.id, data, g.user.email]
    );
    await q("insert into change_log (collection, record_id, action, data, changed_by) values ($1,$2,'save',$3,$4)", [t.collection, t.id, data, g.user.email]);
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const g = await signedIn({ write: true });
  if (g.error) return g.error;
  const t = await target(params);
  if (!t) return NextResponse.json({ error: "Unknown record." }, { status: 400 });
  await inShop(g.shop.id, async (q) => {
    const { rows } = await q(`delete from ${t.table} where id = $1 returning data`, [t.id]);
    await q("insert into change_log (collection, record_id, action, data, changed_by) values ($1,$2,'delete',$3,$4)", [t.collection, t.id, rows[0]?.data ?? null, g.user.email]);
  });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { isSuper } from "@/lib/admin";
import { query } from "@/lib/db";

// XSite staff only: remove an info request (test entries, or someone who asked to be forgotten).
export const dynamic = "force-dynamic";

export async function DELETE(req) {
  const user = await currentUser();
  if (!user || !isSuper(user.email)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const { rowCount } = await query("delete from leads where id = $1", [id]);
  return NextResponse.json({ ok: true, deleted: rowCount });
}

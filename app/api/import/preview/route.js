import { NextResponse } from "next/server";
import { inShop } from "@/lib/db";
import { signedIn } from "@/lib/guard";
import { readSheet } from "@/lib/sheet";
import { findColumns, toCustomers, plan } from "@/lib/qb-import";

const MAX = 5 * 1024 * 1024;

// Step 1 of a QuickBooks import: read the file and show what would happen. Nothing is saved.
export async function POST(req) {
  const g = await signedIn({ write: true });
  if (g.error) return g.error;
  const name = decodeURIComponent(req.headers.get("x-filename") || "customers");
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (buf.length > MAX) return NextResponse.json({ error: "That file is over 5 MB. Export just your customer list and try again." }, { status: 413 });
  let rows;
  try { rows = readSheet(buf, name); }
  catch (e) {
    if (e.message === "old_xls") return NextResponse.json({ error: "That's an older Excel file (.xls). Open it in Excel and use Save As > CSV, then upload the CSV." }, { status: 415 });
    return NextResponse.json({ error: "We couldn't read that file. Upload the CSV or Excel (.xlsx) file QuickBooks exported." }, { status: 415 });
  }
  const found = findColumns(rows);
  if (!found) return NextResponse.json({ error: "We couldn't find the customer name and phone or email columns. Make sure it's the customer list export from QuickBooks." }, { status: 422 });
  const cands = toCustomers(rows, found, g.shop.country).slice(0, 5000);
  const opts = { skipInactive: new URL(req.url).searchParams.get("inactive") !== "keep", merge: new URL(req.url).searchParams.get("merge") !== "off" };
  const existing = await inShop(g.shop.id, async (q) => (await q("select data from customers")).rows.map((r) => r.data));
  const rowsOut = plan(cands, existing, opts);
  const count = (a) => rowsOut.filter((r) => r.action === a).length;
  return NextResponse.json({
    file: name.slice(0, 120),
    columns: Object.fromEntries(Object.entries(found.col).map(([k, i]) => [k, found.headers[i]])),
    counts: { found: rowsOut.length, new: count("new"), merge: count("merge"), skip: count("skip"), balances: rowsOut.filter((r) => r.action !== "skip" && r.balance > 0).length },
    rows: rowsOut,
  });
}

import { NextResponse } from "next/server";
import { inShop } from "@/lib/db";
import { getAvailability } from "@/lib/availability";
import { loadPublic } from "@/lib/public";
import { takesBookings } from "@/lib/shop";

export const dynamic = "force-dynamic";

// Public: open drop-off times for the booking page. Times and counts only.
export async function GET(req) {
  const p = await loadPublic(req.headers);
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!takesBookings(p.shop)) return NextResponse.json({ closed: true, days: [] }, { headers: { "Cache-Control": "no-store" } });
  const service = String(new URL(req.url).searchParams.get("service") || "").slice(0, 80);
  const a = await inShop(p.shop.id, (q) => getAvailability(q, p, 14, { service }));
  return NextResponse.json(a, { headers: { "Cache-Control": "no-store" } });
}

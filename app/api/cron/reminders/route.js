import { NextResponse } from "next/server";
import { runReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Runs every hour (vercel.json). Sends each shop's appointment reminder texts once, from the shop's chosen hour.
// Vercel sends Authorization: Bearer $CRON_SECRET. ?dry=1 lists what would be sent.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const out = await runReminders({ dry });
  return NextResponse.json({ ok: true, dry, ...out });
}

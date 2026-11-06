import { NextResponse } from "next/server";
import { shopByHost } from "@/lib/shop";

export const dynamic = "force-dynamic";

// For the sign-in and signup pages: the shop name on a shop's own address, and the public spam-check key.
export async function GET(req) {
  const shop = await shopByHost(req.headers.get("host"));
  return NextResponse.json({ name: shop?.name || "", turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "" }, { headers: { "Cache-Control": "no-store" } });
}

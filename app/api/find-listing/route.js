import { NextResponse } from "next/server";
import { signedIn } from "@/lib/guard";

export const dynamic = "force-dynamic";

// Look a shop up on Google by name and town, so the Website tab can fill in its Place ID and reviews link.
export async function GET(req) {
  const g = await signedIn();
  if (g.error) return g.error;
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 200);
  if (!q) return NextResponse.json({ error: "Enter the shop name first." }, { status: 400 });
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 503 });
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri",
    },
    body: JSON.stringify({ textQuery: q, regionCode: g.shop.country === "US" ? "US" : "CA", pageSize: 5 }),
  }).catch(() => null);
  if (!r || !r.ok) return NextResponse.json({ error: "Google didn't answer. Try again in a minute." }, { status: 502 });
  const d = await r.json();
  const places = (d.places || []).map((p) => ({
    id: p.id,
    name: p.displayName?.text || "",
    address: p.formattedAddress || "",
    rating: p.rating || null,
    count: p.userRatingCount || 0,
    url: p.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${p.id}`,
  }));
  return NextResponse.json({ places });
}

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { inShop } from "@/lib/db";
import { signedIn } from "@/lib/guard";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 3 * 1024 * 1024;

// Upload one photo for the public website. The Shop Book shrinks photos on the phone before sending.
export async function POST(req) {
  const g = await signedIn({ write: true });
  if (g.error) return g.error;
  const type = (req.headers.get("content-type") || "").split(";")[0];
  if (!TYPES[type]) return NextResponse.json({ error: "Use a JPEG, PNG or WebP photo." }, { status: 415 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ error: "The photo was empty." }, { status: 400 });
  if (buf.length > MAX) return NextResponse.json({ error: "That photo is too large. Keep it under 3 MB." }, { status: 413 });
  const id = randomBytes(10).toString("hex") + "." + TYPES[type];
  await inShop(g.shop.id, (q) => q("insert into photos (id, mime, bytes, uploaded_by) values ($1, $2, $3, $4)", [id, type, buf, g.user.email]));
  return NextResponse.json({ url: `/photos/${id}` });
}

import { asSystem } from "@/lib/db";

// Website photos are public. Their ids are long and random, so they're served by id on any address.
export async function GET(_req, { params }) {
  const { id } = await params;
  if (!/^[a-f0-9]{20}\.(jpg|png|webp)$/.test(id)) return new Response("Not found", { status: 404 });
  const { rows } = await asSystem((q) => q("select mime, bytes from photos where id = $1", [id]));
  if (!rows[0]) return new Response("Not found", { status: 404 });
  return new Response(rows[0].bytes, {
    headers: { "Content-Type": rows[0].mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

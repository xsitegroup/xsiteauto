import { createHash, randomBytes } from "node:crypto";
import { query } from "./db";

// One-time links (password resets, team invites). Only a hash is stored, so a database copy can't be used to sign in.
const hash = (t) => createHash("sha256").update(String(t)).digest("hex");

export async function makeToken(kind, { email, shopId = null, data = {}, hours }) {
  const t = randomBytes(32).toString("base64url");
  await query("insert into tokens (token_hash, kind, email, shop_id, data, expires_at) values ($1, $2, lower($3), $4, $5, now() + make_interval(hours => $6))",
    [hash(t), kind, email, shopId, data, hours]);
  return t;
}

// Marks the token used and returns it, or null if it's unknown, used or expired.
export async function useToken(kind, t) {
  if (!t || String(t).length > 100) return null;
  const { rows } = await query(
    "update tokens set used_at = now() where token_hash = $1 and kind = $2 and used_at is null and expires_at > now() returning *", [hash(t), kind]);
  return rows[0] || null;
}

export async function peekToken(kind, t) {
  if (!t || String(t).length > 100) return null;
  const { rows } = await query("select * from tokens where token_hash = $1 and kind = $2 and used_at is null and expires_at > now()", [hash(t), kind]);
  return rows[0] || null;
}

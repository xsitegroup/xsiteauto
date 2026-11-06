import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const COOKIE = "frs";
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET || "");

// The session carries which shop the person works for (sid) and their role (owner or staff).
export async function signSession(user) {
  return new SignJWT({ email: user.email, name: user.name, sid: user.shop_id || undefined, role: user.role || "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key());
}

export async function verifySession(token) {
  if (!token || !process.env.AUTH_SECRET) return null;
  try { const { payload } = await jwtVerify(token, key()); return payload; }
  catch { return null; }
}

export async function currentUser() {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE)?.value);
}

export const cookieOptions = () => ({
  httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
});

import { NextResponse } from "next/server";
import { currentUser } from "./auth";
import { sessionShop, canWrite, isOpen, shopState } from "./shop";

// For Shop Book endpoints: the signed-in person and their shop, or a ready-made error response.
//   const g = await signedIn({ write: true }); if (g.error) return g.error;
export async function signedIn({ write = false, owner = false } = {}) {
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: "signed_out" }, { status: 401 }) };
  const shop = await sessionShop(user);
  if (!shop || !isOpen(shop)) return { error: NextResponse.json({ error: "signed_out" }, { status: 401 }) };
  if (owner && user.role === "staff") return { error: NextResponse.json({ error: "Only the shop owner can do that." }, { status: 403 }) };
  if (write && !canWrite(shop)) {
    return { error: NextResponse.json({ error: "trial_ended", message: "Your free trial has ended. Keep XSite Auto to add and change jobs again." }, { status: 403 }) };
  }
  return { user, shop, state: shopState(shop) };
}

export const clientIp = (req) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { tokenHash, leadGuidesEmail, GUIDES } from "@/lib/leads";
import { notifyXSite } from "@/lib/xsite";
import { APP_URL } from "@/lib/shop";

// The confirm link from the email: mark the address confirmed, send the guides once, and tell XSite.
export const dynamic = "force-dynamic";
const go = (q) => NextResponse.redirect(`${APP_URL()}/info?${q}`, 303);

export async function GET(req) {
  const t = new URL(req.url).searchParams.get("t") || "";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return go("link=bad");
  const { rows } = await query(
    "update leads set verified_at = coalesce(verified_at, now()) where token_hash = $1 and created_at > now() - interval '7 days' returning *", [tokenHash(t)]);
  const lead = rows[0];
  if (!lead) return go("link=old");
  if (lead.sent_at) return go("sent=1");

  const d = lead.data;
  // Claim the send first so a double click can't send twice.
  const { rowCount } = await query("update leads set sent_at = now() where id = $1 and sent_at is null", [lead.id]);
  if (!rowCount) return go("sent=1");
  try {
    await leadGuidesEmail(lead.email, d.name, d.country);
  } catch (e) {
    console.error("leads: guides email failed", e.message);
    await query("update leads set sent_at = null where id = $1", [lead.id]);
    return go("link=mail");
  }
  const want = (d.interests || []).join(", ") || "not given";
  await notifyXSite("lead_confirmed", {
    subject: `Info request: ${d.shopName} (${d.city}, ${d.region})`,
    heading: "Someone asked for more information",
    intro: `${d.name} confirmed their email and has the white papers and brochure. A call in the next day or two is the best time to follow up.`,
    rows: [["Shop", d.shopName], ["Contact", d.name], ["Phone", d.phone], ["Email", lead.email], ["Where", `${d.city}, ${d.region}, ${d.country}`],
      ["Technicians", d.techs], ["Uses now", d.software || "not given"], ["Interested in", want], ["Notes", d.notes || ""], ["Came from", d.source || ""]],
    data: { lead: { id: lead.id, ...d, email: lead.email, guides: GUIDES(d.country).map((g) => g.name) } },
  });
  return go("sent=1");
}

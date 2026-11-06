import { NextResponse } from "next/server";
import { inShop } from "@/lib/db";
import { signedIn } from "@/lib/guard";
import { mailReady } from "@/lib/mail";
import { sendConfirmation } from "@/lib/notify";
import { getSite, getShopSettings } from "@/lib/site";

// Shop app: email a customer their booking confirmation (with a calendar invite).
export async function POST(req) {
  const g = await signedIn({ write: true });
  if (g.error) return g.error;
  if (!mailReady(g.shop)) return NextResponse.json({ error: "Email isn't set up yet. Call XSite at 905.346.0864 to switch it on." }, { status: 503 });
  const { jobId } = await req.json().catch(() => ({}));
  if (!jobId || typeof jobId !== "string") return NextResponse.json({ error: "Missing job." }, { status: 400 });

  const ctx = await inShop(g.shop.id, async (q) => {
    const { rows: jr } = await q("select data from jobs where id = $1", [jobId]);
    const job = jr[0]?.data;
    if (!job) return { error: "Save the job first, then send the confirmation.", status: 404 };
    const { rows: cr } = await q("select data from customers where id = $1", [job.customerId || ""]);
    const customer = cr[0]?.data;
    if (!customer?.email) return { error: "This customer has no email address on file.", status: 400 };
    return { job, customer, site: await getSite(q, g.shop), settings: await getShopSettings(q) };
  });
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    await sendConfirmation({ ...ctx.job, id: jobId }, ctx.customer, {
      shop: g.shop, site: ctx.site, timeZone: ctx.settings.timeZone || g.shop.timezone, minutes: +ctx.settings.bookingSlotMinutes || 30,
    });
  } catch (e) {
    console.error(e.message);
    return NextResponse.json({ error: "The email didn't go through. Try again in a minute." }, { status: 502 });
  }
  const stamped = { ...ctx.job, confirmedAt: new Date().toISOString(), confirmedBy: "email" };
  await inShop(g.shop.id, async (q) => {
    await q("update jobs set data = $1, updated_by = $2, updated_at = now() where id = $3", [stamped, g.user.email, jobId]);
    await q("insert into change_log (collection, record_id, action, data, changed_by) values ('jobs',$1,'save',$2,$3)", [jobId, stamped, g.user.email]);
  });
  return NextResponse.json({ ok: true, to: ctx.customer.email });
}

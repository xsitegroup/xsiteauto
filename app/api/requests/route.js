import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { inShop } from "@/lib/db";
import { loadPublic } from "@/lib/public";
import { takesBookings } from "@/lib/shop";
import { tidyPostal } from "@/lib/locale";
import { getAvailability } from "@/lib/availability";
import { notifyNewRequest } from "@/lib/notify";

// Public endpoint: a customer sends their details from a shop's booking page.
// Nothing here touches existing customers or jobs. It only adds a "new" request
// that the shop reviews and accepts in the Shop Book.

// Limits: per phone number (stops one person repeating themselves) and a generous
// per-connection cap (customers at the counter share the shop's Wi-Fi).
const PER_PHONE_PER_HOUR = 3;
const PER_CONNECTION_PER_HOUR = 30;
const str = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const text = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max);

// ALL CAPS or all-lowercase names become Title Case; mixed case is left as typed.
function tidyName(n) {
  n = String(n || "").replace(/\s+/g, " ").trim();
  if (!n || (n !== n.toUpperCase() && n !== n.toLowerCase())) return n;
  return n.toLowerCase().replace(/(^|[\s\-'’])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bMc([a-z])/g, (m, c) => "Mc" + c.toUpperCase());
}
function digits10(p) {
  const d = String(p || "").replace(/\D/g, "");
  let x = d.length > 10 && d[0] === "1" ? d.slice(1) : d; // drop the +1 country code
  if (x.length === 11 && x[0] === "0") x = x.slice(1);     // and a stray leading 0 (+1 0905...)
  return x.length === 10 ? x : "";
}
const ok = () => NextResponse.json({ ok: true });
const bad = (error, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req) {
  const p = await loadPublic(req.headers);
  if (!p) return bad("This booking page isn't available.", 404);
  if (!takesBookings(p.shop)) return bad(`Online booking is paused right now. Please call ${p.site.shopName}${p.site.phone ? " at " + p.site.phone : ""}.`, 403);
  let b;
  try { b = await req.json(); } catch { return bad("Something went wrong sending the form. Please try again."); }
  if (!b || typeof b !== "object") return bad("Something went wrong sending the form. Please try again.");

  // Spam traps: a hidden field people never see, and forms filled faster than a person can type.
  if (str(b.website, 200)) return ok();
  if (Number(b.elapsed) > 0 && Number(b.elapsed) < 3000) return ok();

  const name = tidyName(str(b.name, 100));
  const phoneDigits = digits10(b.phone);
  const email = str(b.email, 120).toLowerCase();

  const service = str(b.service, 80);
  const concern = text(b.concern, 1500) || (service && service !== "Something else" ? service : "");
  if (!name) return bad("Please enter your name.");
  if (!phoneDigits) return bad("Please enter a 10-digit phone number so we can reach you.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad("That email address doesn't look right.");
  if (!concern) return bad("Please tell us what the vehicle needs.");
  if (!b.consent) return bad("Please tick the box so we can use your details to contact you.");

  {
    const y = String(b.year || "").replace(/\D/g, ""), thisYear = new Date().getFullYear();
    if (y.length !== 4 || +y < 1950 || +y > thisYear + 1) return bad("Please enter the vehicle's year, like 2018.");
    if (!str(b.make, 40)) return bad("Please enter the vehicle's make, like Toyota.");
    if (!str(b.model, 60)) return bad("Please enter the vehicle's model, like RAV4.");
  }
  let prefDate = str(b.prefDate, 10);
  if (prefDate && !/^\d{4}-\d{2}-\d{2}$/.test(prefDate)) prefDate = "";
  // A time picked on the booking page ("09:30") must still be open when the request arrives.
  const slotTime = /^\d{2}:\d{2}$/.test(String(b.prefTime || "")) ? String(b.prefTime) : "";
  if (slotTime && b.kind !== "checkin") {
    if (!prefDate) return bad("Please pick a day for your drop-off.");
    try {
      const a = await inShop(p.shop.id, (q) => getAvailability(q, p, 14));
      const day = a.days.find((d) => d.date === prefDate);
      const slot = day && day.slots.find((x) => x.time === slotTime);
      if (!slot || !slot.free) return bad("Sorry, that time was just taken. Please pick another time.", 409);
    } catch { /* if the check fails, still take the request; the shop confirms every booking */ }
  }
  const year = String(b.year || "").replace(/\D/g, "").slice(0, 4);

  const data = {
    status: "new",
    kind: b.kind === "checkin" ? "checkin" : "booking",
    name,
    phone: `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`,
    email,
    street: str(b.street, 120),
    city: tidyName(str(b.city, 60)),
    postal: tidyPostal(p.shop.country, b.postal),
    vehicle: {
      year: year.length === 4 ? year : "",
      make: str(b.make, 40),
      model: str(b.model, 60),
      plate: str(b.plate, 12).toUpperCase(),
    },
    odometer: String(b.odometer || "").replace(/\D/g, "").slice(0, 7),
    odoUnit: p.shop.country === "US" ? "mi" : "km",
    visit: b.kind === "checkin" && ["wait", "drop", "ride"].includes(b.visit) ? b.visit : "",
    concern: service && service !== "Something else" && !concern.toLowerCase().startsWith(service.toLowerCase()) ? `${service}: ${concern}` : concern,
    service,
    returning: !!b.returning,
    vehicleNote: str(b.vehicleNote, 80),
    prefDate,
    prefTime: slotTime || (["morning", "afternoon", "any"].includes(b.prefTime) ? b.prefTime : "any"),
    contactBy: ["call", "text", "email"].includes(b.contactBy) ? b.contactBy : "call",
    submitted: new Date().toISOString(),
  };

  // Rate limit per connection, stored only as a one-way hash.
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const ipHash = createHash("sha256").update(ip + "|" + (process.env.AUTH_SECRET || "")).digest("hex").slice(0, 32);
  try {
    const limited = await inShop(p.shop.id, async (q) => {
    const { rows } = await q(
      `select count(*) filter (where ip_hash = $1)::int as by_ip,
              count(*) filter (where data->>'phone' = $2)::int as by_phone
         from requests where created_at > now() - interval '1 hour'`, [ipHash, data.phone]);
    if (rows[0].by_phone >= PER_PHONE_PER_HOUR) return bad("We've already got a request from this phone number in the last hour, so there's no need to send another. If anything's changed, give us a call.", 429);
    if (rows[0].by_ip >= PER_CONNECTION_PER_HOUR) return bad("We're getting a lot of requests right now. Please give us a call instead.", 429);
    const id = "rq-" + Date.now().toString(36) + "-" + randomBytes(4).toString("hex");
    await q("insert into requests (id, data, ip_hash) values ($1, $2, $3)", [id, data, ipHash]);
    return null;
    });
    if (limited) return limited;
  } catch (e) {
    console.error("requests: save failed", e.message);
    return bad("We couldn't save your request just now. Please call us instead.", 503);
  }
  // Receipt to the customer and an alert to the shop. Never holds up or fails the booking.
  try {
    await Promise.race([notifyNewRequest(data, p), new Promise((r) => setTimeout(r, 8000))]);
  } catch (e) { console.error("requests: notify failed", e.message); }
  return ok();
}

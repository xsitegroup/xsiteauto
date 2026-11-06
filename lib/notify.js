import { fmtPhone, telHref } from "@/lib/site";
import { shopAppUrl } from "@/lib/shop";
import { sendMail, mailReady, emailLayout, esc, bookingIcs, whenText } from "@/lib/mail";

const addr = (s) => [s.street, [s.town, s.province].filter(Boolean).join(", "), s.postal].map((x) => String(x || "").trim()).filter(Boolean).join(", ");
const vehText = (v) => [v?.year, v?.make, v?.model].filter(Boolean).join(" ") + (v?.plate ? ` · ${v.plate}` : "");

// A new booking request or check-in: a receipt to the customer, and an alert to the shop.
// p: { shop, site } for the shop the request is for.
export async function notifyNewRequest(r, { shop, site }) {
  if (!mailReady(shop)) return;
  const shopEmail = site.email || "";
  const when = r.prefDate ? whenText(r.prefDate, r.prefTime) : "";
  const tel = telHref(site.phone);
  const jobs = [];

  if (r.email && r.kind !== "checkin") {
    jobs.push(sendMail({
      shop,
      to: r.email,
      replyTo: shopEmail,
      subject: `We've got your booking request${when ? ` for ${when}` : ""}`,
      html: emailLayout({
        shopName: site.shopName,
        heading: "Request received",
        intro: `Thanks, ${esc(r.name.split(" ")[0])}. ${when ? `We've held <b>${esc(when)}</b> for you. ` : ""}We'll ${r.contactBy === "text" ? "text" : r.contactBy === "email" ? "email" : "call"} you to confirm. This isn't a confirmed booking yet.`,
        rows: [["Vehicle", esc(vehText(r.vehicle))], ["What it needs", esc(r.concern)]],
        footer: `Need to change something? Reply to this email${tel ? ` or call ${esc(fmtPhone(site.phone))}` : ""}.`,
      }),
    }));
  }

  if (shopEmail) {
    const url = await shopAppUrl(shop);
    jobs.push(sendMail({
      shop,
      to: shopEmail,
      replyTo: r.email || undefined,
      subject: `New ${r.kind === "checkin" ? "check-in" : "booking request"}: ${r.name}${when ? `, ${when}` : ""}`,
      html: emailLayout({
        shopName: site.shopName,
        heading: r.kind === "checkin" ? "Walk-in check-in" : "New booking request",
        intro: `${esc(r.name)} ${r.returning ? "(says they've been here before) " : ""}sent a ${r.kind === "checkin" ? "check-in" : "booking request"}. Open the shop app to accept it.`,
        rows: [
          ...(when ? [["When", esc(when)]] : []),
          ["Phone", esc(r.phone)],
          ...(r.email ? [["Email", esc(r.email)]] : []),
          ["Vehicle", esc(vehText(r.vehicle))],
          ["What it needs", esc(r.concern)],
          ["Confirm by", esc(r.contactBy === "text" ? "Text" : r.contactBy === "email" ? "Email" : "Phone call")],
        ],
        buttons: url ? [["Open the shop app", url]] : [],
      }),
    }));
  }
  const res = await Promise.allSettled(jobs);
  res.forEach((x) => { if (x.status === "rejected") console.error("notify:", x.reason?.message); });
}

// The shop confirmed a booked job: email the customer with a calendar invite.
export async function sendConfirmation(job, customer, { shop, site, timeZone = "America/Toronto", minutes = 30 }) {
  const shopEmail = site.email || "";
  const where = addr(site);
  const when = whenText(job.date, job.time);
  const maps = where ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${site.shopName}, ${where}`)}` : "";
  const ics = /^\d{2}:\d{2}$/.test(job.time || "") ? bookingIcs({
    uid: job.id, date: job.date, time: job.time, minutes, timeZone,
    title: `${site.shopName}: ${job.vehicle || "vehicle"} drop-off`,
    location: [site.shopName, where].filter(Boolean).join(", "),
    description: `RO ${job.ro}. ${job.concern || ""}\nQuestions? ${fmtPhone(site.phone)}`,
  }) : null;
  return sendMail({
    shop,
    to: customer.email,
    replyTo: shopEmail,
    subject: `You're booked: ${when} at ${site.shopName}`,
    html: emailLayout({
      shopName: site.shopName,
      heading: "You're booked",
      intro: `Hi ${esc((customer.name || "").split(" ")[0])}, your drop-off is confirmed. See you then.`,
      rows: [
        ["When", esc(when)],
        ...(where ? [["Where", esc(where)]] : []),
        ...(job.vehicle ? [["Vehicle", esc(job.vehicle)]] : []),
        ...(job.concern ? [["What it needs", esc(job.concern)]] : []),
        ["Repair order", esc(job.ro)],
      ],
      buttons: maps ? [["Get directions", maps]] : [],
      footer: `${ics ? "The attached calendar file adds this to your calendar. " : ""}Need to change the time? Reply to this email${site.phone ? ` or call ${esc(fmtPhone(site.phone))}` : ""}.`,
    }),
    attachments: ics ? [{ name: "booking.ics", contentType: "text/calendar", content: ics }] : [],
  });
}

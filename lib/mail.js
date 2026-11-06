// Email for every shop. Two ways to send:
//  1. A shop's own Microsoft 365 mailbox through Microsoft Graph (optional).
//     Needs MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and MAIL_FROM, and is used only for the shop
//     named in MS_MAIL_SHOP (its slug) so no other shop sends from that mailbox.
//  2. The built-in sender for everyone else (trial shops, and XSite's own trial emails): Resend,
//     with RESEND_API_KEY, from PLATFORM_FROM (default notifications@xsiteauto.com). Replies go to the shop.
// When neither is set up, nothing is sent and mailReady() is false.

let token = null, tokenExp = 0;

const msReady = () => !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MAIL_FROM);
const msShop = () => (process.env.MS_MAIL_SHOP || "").trim().toLowerCase();
const usesMs = (shop) => msReady() && shop && !!msShop() && shop.slug === msShop();
const platformReady = () => !!process.env.RESEND_API_KEY;
const platformFrom = () => process.env.PLATFORM_FROM || "notifications@xsiteauto.com";

// shop: the shop the email is for, or null for XSite's own emails.
export const mailReady = (shop) => usesMs(shop) || platformReady();

async function graphToken() {
  if (token && Date.now() < tokenExp - 60_000) return token;
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(process.env.MS_TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error("mail: couldn't sign in to Microsoft 365 (" + (d.error || r.status) + ")");
  token = d.access_token;
  tokenExp = Date.now() + (d.expires_in || 3600) * 1000;
  return token;
}

async function sendGraph({ to, subject, html, replyTo, attachments }) {
  const t = await graphToken();
  const message = {
    subject,
    body: { contentType: "HTML", content: html },
    toRecipients: [{ emailAddress: { address: to } }],
    ...(replyTo ? { replyTo: [{ emailAddress: { address: replyTo } }] } : {}),
    attachments: attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name,
      contentType: a.contentType,
      contentBytes: Buffer.from(a.content).toString("base64"),
    })),
  };
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.MAIL_FROM)}/sendMail`, {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!r.ok) {
    const e = await r.text().catch(() => "");
    throw new Error(`mail: Microsoft 365 refused the email (${r.status}) ${e.slice(0, 200)}`);
  }
}

// Display names can't carry quotes or angle brackets.
const safeName = (s) => String(s || "").replace(/["<>\r\n]/g, "").trim().slice(0, 60);

async function sendPlatform({ shop, fromName, to, subject, html, replyTo, attachments }) {
  const name = fromName || (shop ? `${safeName(shop.name)} via XSite Auto` : "XSite Auto");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `${safeName(name)} <${platformFrom()}>`,
      to: [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      attachments: attachments.map((a) => ({ filename: a.name, content: Buffer.from(a.content).toString("base64"), content_type: a.contentType })),
    }),
  });
  if (!r.ok) {
    const e = await r.text().catch(() => "");
    throw new Error(`mail: the email service refused the email (${r.status}) ${e.slice(0, 200)}`);
  }
}

// sendMail({ shop, to, subject, html, replyTo?, fromName?, attachments?: [{ name, contentType, content }] })
export async function sendMail({ shop = null, to, subject, html, replyTo, fromName, attachments = [] }) {
  if (!mailReady(shop)) return { sent: false, reason: "not_configured" };
  if (!to) return { sent: false, reason: "no_address" };
  if (usesMs(shop)) await sendGraph({ to, subject, html, replyTo, attachments });
  else await sendPlatform({ shop, fromName, to, subject, html, replyTo, attachments });
  return { sent: true };
}

// ---------- shared email layout ----------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export { esc };

export function emailLayout({ shopName, heading, intro, rows = [], buttons = [], footer = "", accent = "#e8961f", accentInk = "#111a23", signoff }) {
  const rowHtml = rows.map(([k, v]) =>
    `<tr><td style="padding:8px 0;color:#56636f;font-size:14px;width:120px;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;font-size:15px;color:#111a23;font-weight:600">${v}</td></tr>`).join("");
  const btnHtml = buttons.map(([label, href]) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:4px 8px 4px 0;padding:12px 18px;border-radius:8px;background:${accent};color:${accentInk};font-weight:700;text-decoration:none;font-size:15px">${esc(label)}</a>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#eef1f4;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#16202a;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.04em;text-transform:uppercase">${esc(shopName)}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 10px;font-size:24px;color:#111a23">${esc(heading)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#3d4954">${intro}</p>
${rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #d4dbe2;border-bottom:1px solid #d4dbe2;margin:0 0 18px">${rowHtml}</table>` : ""}
${btnHtml ? `<div style="margin:0 0 12px">${btnHtml}</div>` : ""}
${footer ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#56636f">${footer}</p>` : ""}
</td></tr></table>
<p style="font-size:11px;color:#8a96a3;margin:14px 0 0">${signoff ?? `Sent by ${esc(shopName)} through XSite Auto`}</p>
</td></tr></table></body></html>`;
}

// ---------- calendar invite ----------
// Converts a shop-local date and time to UTC using the shop's time zone.
function localToUtc(date, time, timeZone) {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess - (asLocal - guess));
}
const icsDate = (dt) => dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);

export function bookingIcs({ uid, date, time, minutes = 30, timeZone = "America/Toronto", title, location, description }) {
  const start = localToUtc(date, time, timeZone);
  const end = new Date(start.getTime() + minutes * 60000);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//XSite Auto//Booking//EN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@xsiteauto`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(title)}`,
    `LOCATION:${icsText(location)}`,
    `DESCRIPTION:${icsText(description)}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}

// "2026-11-05", "09:30" -> "Thursday, November 5 at 9:30 AM"
export function whenText(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  if (!/^\d{2}:\d{2}$/.test(time || "")) return day;
  const [h, mm] = time.split(":").map(Number);
  return `${day} at ${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

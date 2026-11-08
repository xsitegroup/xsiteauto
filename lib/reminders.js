import { query, inShop, asSystem } from "./db";
import { getSite, getShopSettings, digits10 } from "./site";
import { shopById, shopAppUrl } from "./shop";
import { sendSms, smsOn, smsLive } from "./sms";
import { sendMail, mailReady, emailLayout, esc } from "./mail";

// Text appointment reminders. Settings live in the shop's settings record:
//   reminders: { on: true, hour: 10, days: 1, skipSunday: true }
// The hourly job texts every booked job on the target day once, from `hour` (shop time) until 8 pm.
// Replies: YES confirms, NO flags it for a call, anything else is passed to the shop, STOP opts out.

export const REMINDER_DEFAULTS = { on: false, hour: 10, days: 1, skipSunday: true };
const QUIET_FROM = 20 * 60;   // no texts after 8 pm shop time

function shopNow(timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}
const addDays = (ymd, n) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const weekday = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const dayText = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }); };
export const timeText = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); if (!m) return ""; let h = +m[1]; const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return `${h}:${m[2]} ${ap}`; };
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";

// Which appointment dates get texted today (shop time).
export function targetDates(rem, today) {
  const days = rem.days === 2 ? 2 : 1;
  const wd = weekday(today);
  if (rem.skipSunday !== false && wd === 0) return [];
  const out = [addDays(today, days)];
  if (rem.skipSunday !== false && wd === 6) out.push(addDays(today, days + 1));   // Saturday also covers Sunday's texts
  return out;
}

export function reminderText({ shopName, customer, date, time, vehicle, today }) {
  const first = firstName(customer);
  const when = (date === addDays(today, 1) ? `tomorrow, ${dayText(date)}` : dayText(date)) + (time ? ` at ${timeText(time)}` : "");
  return `${first ? `Hi ${first}, this` : "This"} is ${shopName}. Reminder: your appointment is ${when}${vehicle ? ` for your ${vehicle}` : ""}. Will you be able to make it? Reply YES or NO.`;
}

// Send what's due. dry: list what would be sent. Returns a log.
export async function runReminders({ dry = false } = {}) {
  const log = [];
  if (!smsOn()) return { log: ["Texting isn't set up (Twilio or SMS_TEST)."] };
  const { rows: shops } = await query("select * from shops where status in ('trial', 'active', 'past_due') order by created_at");
  for (const shop of shops) {
    try {
      await inShop(shop.id, async (q) => {
        const settings = await getShopSettings(q);
        const rem = { ...REMINDER_DEFAULTS, ...(settings.reminders || {}) };
        if (!rem.on) return;
        const tz = settings.timeZone || shop.timezone || "America/Toronto";
        const now = shopNow(tz);
        if (now.minutes < rem.hour * 60 || now.minutes >= QUIET_FROM) return;
        const dates = targetDates(rem, now.date);
        if (!dates.length) return;
        const { rows: jobs } = await q("select id, data from jobs where data->>'status' = 'booked' and data->>'date' = any($1)", [dates]);
        const live = jobs.filter((j) => !j.data.example && !j.data.opening && j.data.customerId);
        if (!live.length) return;
        const { rows: done } = await q("select job_id, appt_date::text as d from reminders where job_id = any($1) and appt_date = any($2::date[])", [live.map((j) => j.id), dates]);
        const sent = new Set(done.map((r) => `${r.job_id}|${r.d}`));
        const { rows: custs } = await q("select id, data from customers where id = any($1)", [live.map((j) => j.data.customerId)]);
        const cust = Object.fromEntries(custs.map((c) => [c.id, c.data]));
        const site = await getSite(q, shop);
        const shopName = settings.shopName || site.shopName || shop.name;
        const phones = custs.map((c) => digits10(c.data.phone)).filter(Boolean);
        const { rows: outs } = await q("select phone from sms_optouts where phone = any($1)", [phones]);
        const optedOut = new Set(outs.map((o) => o.phone));
        for (const j of live) {
          const d = j.data, c = cust[d.customerId];
          if (sent.has(`${j.id}|${d.date}`)) continue;
          const phone = digits10(c?.phone);
          if (!phone) continue;
          if (optedOut.has(phone)) {
            if (!dry) await q("insert into reminders (job_id, appt_date, phone, status) values ($1, $2, $3, 'optout') on conflict do nothing", [j.id, d.date, phone]);
            continue;
          }
          const body = reminderText({ shopName, customer: c.name, date: d.date, time: d.time, vehicle: d.vehicle, today: now.date });
          log.push(`${shop.slug}: ${c.name} ${phone} for ${d.date}${dry ? " (dry run)" : ""}`);
          if (dry) continue;
          const { rowCount } = await q("insert into reminders (job_id, appt_date, phone, body, test) values ($1, $2, $3, $4, $5) on conflict do nothing", [j.id, d.date, phone, body, !smsLive()]);
          if (!rowCount) continue;
          try {
            const r = await sendSms(phone, body, { country: shop.country });
            await q("update reminders set sid = $3 where job_id = $1 and appt_date = $2", [j.id, d.date, r.sid]);
          } catch (e) {
            await q("update reminders set status = 'failed', error = $3 where job_id = $1 and appt_date = $2", [j.id, d.date, String(e.message).slice(0, 300)]);
            log.push(`${shop.slug}: failed for ${phone}: ${e.message}`);
          }
        }
      });
    } catch (e) {
      log.push(`${shop.slug}: stopped: ${e.message}`);
    }
  }
  return { log };
}

const STOP = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout", "revoke"]);
const START = new Set(["start", "unstop", "subscribe"]);
const YES = new Set(["yes", "y", "yeah", "yep", "yup", "ya", "yea", "ok", "okay", "k", "sure", "confirm", "confirmed", "correct", "absolutely", "definitely", "will", "👍"]);
const NO = new Set(["no", "n", "nope", "nah", "cant", "cannot", "can't", "reschedule", "unable", "wont", "won't"]);

export function classify(text) {
  const t = String(text || "").trim().toLowerCase();
  const word = t.replace(/[^\p{L}\p{N}'👍]+/gu, " ").trim().split(/\s+/)[0] || "";
  if (STOP.has(word) && t.split(/\s+/).length <= 2) return "stop";
  if (START.has(word) && t.split(/\s+/).length <= 2) return "start";
  if (YES.has(word) || /^(yes|yep|yeah)\b/.test(t) || t === "👍") return "yes";
  if (NO.has(word) || /^(no|nope)\b/.test(t) || /\b(can'?t|cannot|won'?t) make it\b/.test(t)) return "no";
  return "other";
}

// A text from a customer. Returns the text to send back ("" for none).
export async function handleReply({ from, body }) {
  const phone = digits10(from);
  if (!phone) return "";
  const kind = classify(body);
  if (kind === "stop") { await query("insert into sms_optouts (phone) values ($1) on conflict do nothing", [phone]); return ""; }
  if (kind === "start") { await query("delete from sms_optouts where phone = $1", [phone]); return ""; }

  const rem = await asSystem(async (q) => (await q(
    "select shop_id, job_id, appt_date::text as appt_date, status from reminders where phone = $1 and status <> 'failed' and status <> 'optout' and sent_at > now() - interval '7 days' order by sent_at desc limit 1", [phone])).rows[0]);
  if (!rem) return "";
  const shop = await shopById(rem.shop_id);
  if (!shop) return "";
  // A later message after NO keeps the booking flagged as "can't make it"; the newest text is shown.
  const status = kind === "yes" ? "confirmed" : kind === "no" ? "declined" : rem.status === "declined" ? "declined" : "replied";
  const ctx = await inShop(shop.id, async (q) => {
    await q("update reminders set status = $3, reply = $4, replied_at = now() where job_id = $1 and appt_date = $2", [rem.job_id, rem.appt_date, status, String(body || "").slice(0, 600)]);
    const job = (await q("select data from jobs where id = $1", [rem.job_id])).rows[0]?.data || {};
    const cust = job.customerId ? (await q("select data from customers where id = $1", [job.customerId])).rows[0]?.data || {} : {};
    const settings = await getShopSettings(q);
    const site = await getSite(q, shop);
    return { job, cust, site, shopName: settings.shopName || site.shopName || shop.name };
  });
  const when = `${dayText(rem.appt_date)}${ctx.job.time ? ` at ${timeText(ctx.job.time)}` : ""}`;
  if (status !== "confirmed") await alertShop(shop, ctx, { status, body, when, phone }).catch((e) => console.error("reminder alert:", e.message));
  if (status === "confirmed") return `Thanks${firstName(ctx.cust.name) ? `, ${firstName(ctx.cust.name)}` : ""}! See you ${when}. - ${ctx.shopName}`;
  if (status === "declined") return `Thanks for letting us know. ${ctx.shopName} will call you to find a new time.`;
  return `Thanks, we got your message. ${ctx.shopName} will get back to you.`;
}

async function alertShop(shop, { job, cust, site }, { status, body, when, phone }) {
  if (!site.email || !mailReady(shop)) return;
  const url = await shopAppUrl(shop);
  const name = cust.name || "A customer";
  await sendMail({
    shop, to: site.email,
    subject: status === "declined" ? `Can't make it: ${name}, ${when}` : `Text from ${name} about ${when}`,
    html: emailLayout({
      shopName: site.shopName,
      heading: status === "declined" ? "Can't make their appointment" : "Reply to a reminder",
      intro: status === "declined" ? `${esc(name)} replied NO to the reminder text. Give them a call to find a new time.` : `${esc(name)} replied to the reminder text.`,
      rows: [["Appointment", esc(when)], ["Vehicle", esc(job.vehicle || "")], ["Phone", esc(phone.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3"))], ["Their text", esc(body || "")]],
      buttons: url ? [["Open the shop app", url]] : [],
    }),
  });
}

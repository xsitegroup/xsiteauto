// q is a query function from inShop() for the shop; site and shop settings are already loaded.

// Open drop-off times for the next few days, worked out from the shop's hours
// minus jobs already on the schedule and booking requests still waiting.
// Returns only times and counts, never anything about customers.

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// "Now" in the shop's own time zone, as a date string and minutes past midnight.
function shopNow(timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: +parts.hour * 60 + +parts.minute };
}
function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
const weekday = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

export async function getAvailability(q, { site, settings: shop = {}, timeZone: tz }, days = 14) {

  const slotMinutes = [15, 30, 60].includes(+shop.bookingSlotMinutes) ? +shop.bookingSlotMinutes : 30;
  const perSlot = Math.max(1, Math.min(10, +shop.bookingPerSlot || 1));
  const perDay = Math.max(1, Math.min(50, +shop.bookingPerDay || 6));
  const leadMinutes = 60;           // no booking less than an hour from now
  const lastBeforeClose = 60;       // last drop-off an hour before closing
  const timeZone = shop.timeZone || tz || "America/Toronto";

  const now = shopNow(timeZone);
  const from = now.date, to = addDays(from, days - 1);

  // Count what's already taken on each day and at each time.
  const taken = {}; // date -> { total, at: { "09:00": n } }
  const mark = (date, time) => {
    if (!date || date < from || date > to) return;
    const d = (taken[date] ||= { total: 0, at: {} });
    d.total++;
    const m = toMin(time);
    if (m !== null) { const k = toHHMM(m - (m % slotMinutes)); d.at[k] = (d.at[k] || 0) + 1; }
  };
  try {
    const { rows: jobs } = await q(
      "select data->>'date' as date, data->>'time' as time from jobs where data->>'date' between $1 and $2 and coalesce(data->>'status','') <> 'cancelled' and coalesce(data->>'opening','') = ''",
      [from, to]);
    jobs.forEach((j) => mark(j.date, j.time));
    const { rows: reqs } = await q(
      "select data->>'prefDate' as date, data->>'prefTime' as time from requests where data->>'status' = 'new' and data->>'kind' = 'booking' and data->>'prefDate' between $1 and $2",
      [from, to]);
    reqs.forEach((r) => mark(r.date, r.time));
  } catch (e) {
    console.error("availability: database unavailable", e.message);
  }

  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const h = site.hours.find((x) => x.day === DAY_NAMES[weekday(date)]);
    const open = h && !h.closed ? toMin(h.open) : null, close = h && !h.closed ? toMin(h.close) : null;
    const t = taken[date] || { total: 0, at: {} };
    const slots = [];
    if (open !== null && close !== null && close > open) {
      for (let m = open; m <= close - lastBeforeClose; m += slotMinutes) {
        if (date === now.date && m < now.minutes + leadMinutes) continue;
        const k = toHHMM(m);
        slots.push({ time: k, free: t.total < perDay && (t.at[k] || 0) < perSlot });
      }
    }
    out.push({ date, open: open !== null, slots, free: slots.filter((s) => s.free).length });
  }
  return { timeZone, slotMinutes, days: out };
}

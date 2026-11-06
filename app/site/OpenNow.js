"use client";
import { useEffect, useState } from "react";

const NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const mins = (t) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmt = (t) => { const [h, m] = t.split(":").map(Number); return ((h + 11) % 12 + 1) + (m ? ":" + String(m).padStart(2, "0") : "") + (h >= 12 ? "pm" : "am"); };

// Shop-time status ("Open now · until 5pm"), worked out on the visitor's device since the page is cached.
export default function OpenNow({ hours, timeZone = "America/Toronto" }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    const tick = () => {
      const p = {};
      new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
      const d = NAMES.indexOf(p.weekday), now = +p.hour * 60 + +p.minute;
      document.querySelectorAll("[data-day]").forEach((r) => r.classList.toggle("today", +r.dataset.day === d));
      const h = hours[d];
      if (h && !h.closed && mins(h.open) !== null && now >= mins(h.open) && now < mins(h.close)) return setState({ open: true, text: `Open now · until ${fmt(h.close)}` });
      for (let i = 0; i < 8; i++) {
        const k = (d + i) % 7, x = hours[k];
        if (!x || x.closed || !x.open) continue;
        if (i === 0 && now >= mins(x.open)) continue;
        return setState({ open: false, text: `Closed · opens ${i === 0 ? "today" : i === 1 ? "tomorrow" : NAMES[k]} at ${fmt(x.open)}` });
      }
      setState({ open: false, text: "Closed" });
    };
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [hours, timeZone]);
  return <p className={"status" + (state ? (state.open ? " open" : " closed") : "")}>{state ? state.text : " "}</p>;
}

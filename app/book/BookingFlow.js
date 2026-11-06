"use client";
import { useEffect, useState } from "react";
import BookForm from "./BookForm";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d)); return { dow: DAY[t.getUTCDay()], mon: MON[m - 1], d }; };
const longDay = (ymd) => { const p = parts(ymd); return `${p.dow}, ${p.mon} ${p.d}`; };
export function fmt12(t) {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// The shop page's booking card. Pick a service, a day and an open time, then fill in the details.
export default function BookingFlow({ children, services, shopName, phone, tel, base = "", postalLabel, odoUnit, embed = false }) {
  const [avail, setAvail] = useState(null);   // null = loading, false = failed
  const [service, setService] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [step, setStep] = useState("pick");   // pick | details

  async function load(keepDate) {
    try {
      const r = await fetch(`${base}/api/availability`, { cache: "no-store" });
      const a = await r.json();
      setAvail(a);
      const first = a.days.find((d) => d.free > 0);
      if (!keepDate || !a.days.find((d) => d.date === keepDate && d.free > 0)) setDate(first ? first.date : "");
    } catch { setAvail(false); }
  }
  useEffect(() => { load(); }, []);

  const day = avail && avail.days.find((d) => d.date === date);
  const morning = day ? day.slots.filter((s) => +s.time.slice(0, 2) < 12) : [];
  const afternoon = day ? day.slots.filter((s) => +s.time.slice(0, 2) >= 12) : [];
  const ready = date && time;

  function onTaken() { setTime(""); setStep("pick"); load(date); if (!embed) window.scrollTo({ top: 0, behavior: "smooth" }); }

  const card = (
    <aside className="bk-card" aria-label="Book a drop-off">
      <h2>Book a drop-off</h2>
      {step === "details" ? (
        <div className="bk-chosen">
          <div><b>{longDay(date)}</b> at <b>{fmt12(time)}</b>{service && <><br /><span>{service}</span></>}</div>
          <button type="button" className="bk-link" onClick={() => setStep("pick")}>Change</button>
        </div>
      ) : (
        <>
          <label className="bk-fld"><span>What does it need?</span>
            <select id="bk-service" value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">Choose a service (optional)</option>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="Something else">Something else</option>
            </select>
          </label>

          <div className="bk-fld"><span>Day</span>
            {avail === null && <p className="bk-note">Checking open times…</p>}
            {avail === false && <p className="bk-note">We couldn't load open times. Please call {phone || "the shop"} to book.</p>}
            {avail && (
              <div className="bk-days" role="radiogroup" aria-label="Day">
                {avail.days.filter((d) => d.open).map((d) => {
                  const p = parts(d.date), full = d.free === 0;
                  return (
                    <button key={d.date} type="button" role="radio" aria-checked={d.date === date} disabled={full}
                      className={"bk-day" + (d.date === date ? " on" : "") + (full ? " full" : "")}
                      onClick={() => { setDate(d.date); setTime(""); }}>
                      <span className="dow">{p.dow}</span><span className="dn">{p.d}</span><span className="mo">{full ? "Full" : p.mon}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {day && (
            <div className="bk-fld"><span>Drop-off time</span>
              {[["Morning", morning], ["Afternoon", afternoon]].map(([label, list]) => list.length > 0 && (
                <div key={label} className="bk-slots-grp">
                  <p className="bk-sub">{label}</p>
                  <div className="bk-slots" role="radiogroup" aria-label={`${label} times`}>
                    {list.map((s) => (
                      <button key={s.time} type="button" role="radio" aria-checked={s.time === time} disabled={!s.free}
                        className={"bk-slot" + (s.time === time ? " on" : "")} onClick={() => setTime(s.time)}>
                        {fmt12(s.time)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {day.free === 0 && <p className="bk-note">That day is full. Try another day.</p>}
            </div>
          )}

          <button type="button" className="btn btn-call bk-go" disabled={!ready}
            onClick={() => { setStep("details"); if (!embed) setTimeout(() => document.getElementById("bk-details")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>
            {ready ? `Continue: ${parts(date).dow} at ${fmt12(time)}` : "Pick a day and time"}
          </button>
        </>
      )}
      <p className="bk-fine">Free to book. {shopName} confirms every booking by call, text or email.</p>
      {tel && <p className="bk-fine">Rather talk to someone? <a href={`tel:${tel}`}>{phone}</a></p>}
    </aside>
  );

  const details = (
    <section id="bk-details" className="bk-details">
      <p className="eyebrow">Almost done</p>
      <h2>Your details</h2>
      <BookForm checkin={false} base={base} postalLabel={postalLabel} odoUnit={odoUnit} shopName={shopName} phone={phone} tel={tel}
        slot={{ date, time, service, label: `${longDay(date)} at ${fmt12(time)}` }} onTaken={onTaken} />
    </section>
  );
  if (embed) return <div className="bk-embed">{card}{step === "details" && details}</div>;

  return (
    <div className="bk-grid">
      <div className="bk-main">
        {step === "details" ? details : children}
      </div>
      {card}
    </div>
  );
}

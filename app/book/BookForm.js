"use client";
import { useEffect, useRef, useState } from "react";

const blank = { name: "", phone: "", email: "", street: "", city: "", postal: "", year: "", make: "", model: "", plate: "",
  concern: "", prefDate: "", prefTime: "any", contactBy: "call", consent: false, website: "", returning: false, vehicleNote: "", odometer: "", visit: "" };
const fmtOdo = (v) => { const d = String(v).replace(/\D/g, "").slice(0, 7); return d ? Number(d).toLocaleString("en-US") : ""; };

function fmtPhoneTyping(v) {
  let d = v.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  if (d.length > 10) return v;
  return d.slice(0, 3) + (d.length > 3 ? "-" + d.slice(3, 6) : "") + (d.length > 6 ? "-" + d.slice(6) : "");
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function BookForm({ checkin, shopName, phone, tel, slot, onTaken, base = "", postalLabel = "Postal code", odoUnit = "km" }) {
  const [f, setF] = useState(blank);
  const [state, setState] = useState("idle"); // idle | sending | done
  const [taken, setTaken] = useState(false);
  const picked = slot && slot.service && slot.service !== "Something else";
  const [err, setErr] = useState("");
  const [onFile, setOnFile] = useState(null); // what's missing from a returning customer's file (never the details)
  const started = useRef(Date.now());
  const errRef = useRef(null);
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.type === "checkbox" ? e.target.checked : k === "phone" ? fmtPhoneTyping(e.target.value) : k === "odometer" ? fmtOdo(e.target.value) : e.target.value }));
  const today = ymd(new Date());
  const max = ymd(new Date(Date.now() + 90 * 864e5));

  useEffect(() => {
    if (!f.returning) { setOnFile(null); return; }
    const digits = f.phone.replace(/\D/g, "");
    if (f.name.trim().length < 3 || digits.length < 10) { setOnFile(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${base}/api/requests/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.name, phone: f.phone }) });
        const d = await r.json();
        setOnFile(d && d.match ? d : null);
      } catch { setOnFile(null); }
    }, 700);
    return () => clearTimeout(t);
  }, [f.returning, f.name, f.phone]);

  useEffect(() => { if (err && errRef.current) errRef.current.scrollIntoView({ block: "center", behavior: "smooth" }); }, [err]);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setTaken(false);
    setState("sending");
    const when = slot ? { prefDate: slot.date, prefTime: slot.time, service: slot.service || "" } : {};
    try {
      const r = await fetch(`${base}/api/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(f.returning
          ? { name: f.name, phone: f.phone, email: f.email, street: f.street, city: f.city, postal: f.postal, year: f.year, make: f.make, model: f.model, plate: f.plate, odometer: f.odometer, visit: f.visit, concern: f.concern, prefDate: f.prefDate, prefTime: f.prefTime, contactBy: f.contactBy, consent: f.consent, website: f.website, returning: true, kind: checkin ? "checkin" : "booking", elapsed: Date.now() - started.current, ...when }
          : { ...f, returning: false, kind: checkin ? "checkin" : "booking", elapsed: Date.now() - started.current, ...when }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setState("done"); window.scrollTo({ top: 0 }); return; }
      if (r.status === 409 && onTaken) setTaken(true);
      setErr(d.error || "Something went wrong. Please try again or give us a call.");
    } catch {
      setErr("We couldn't reach the shop's system. Check your connection, or give us a call.");
    }
    setState("idle");
  }

  if (state === "done") {
    return (
      <div className="book-done" role="status">
        <h2>{checkin ? "You're checked in" : "Request sent"}</h2>
        <p>{checkin
          ? `Thanks, ${f.name.split(" ")[0]}. We have your details and will come find you.`
          : `Thanks, ${f.name.split(" ")[0]}. ${slot ? `We've held ${slot.label} for you. ` : ""}${shopName} will ${f.contactBy === "email" ? "email" : f.contactBy === "text" ? "text" : "call"} you to confirm${slot ? "" : " the day and time"}.`}</p>
        {tel && !checkin && <p className="book-small">In a hurry? Call <a href={`tel:${tel}`}>{phone}</a>.</p>}
        <a className="btn btn-text" href="/">Back to the website</a>
      </div>
    );
  }

  return (
    <form className="book-form" onSubmit={submit} noValidate>
      <label className={"returning" + (f.returning ? " on" : "")}>
        <input id="b-returning" type="checkbox" checked={f.returning} onChange={set("returning")} />
        <span><b>I've been here before</b><small>We already have your details, so you just need your name, phone, the vehicle and what it needs. You can add anything that's new or missing too.</small></span>
      </label>
      <fieldset>
        <legend>About you</legend>
        <label className="fld"><span className="fl">Full name</span><input id="b-name" value={f.name} onChange={set("name")} autoComplete="name" required /></label>
        <div className="two">
          <label className="fld"><span className="fl">Phone</span><input id="b-phone" value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="905-555-0142" required /></label>
          {!f.returning && <label className="fld"><span className="fl">Email <i>(optional)</i></span><input id="b-email" value={f.email} onChange={set("email")} inputMode="email" autoComplete="email" /></label>}
        </div>
        {!f.returning && <>
          <label className="fld"><span className="fl">Street address <i>(optional)</i></span><input id="b-street" value={f.street} onChange={set("street")} autoComplete="street-address" /></label>
          <div className="two">
            <label className="fld"><span className="fl">Town</span><input id="b-city" value={f.city} onChange={set("city")} autoComplete="address-level2" /></label>
            <label className="fld"><span className="fl">{postalLabel}</span><input id="b-postal" value={f.postal} onChange={set("postal")} autoComplete="postal-code" /></label>
          </div>
        </>}
      </fieldset>

      {f.returning && (
        <fieldset className="extra">
          <legend>Anything new or missing?</legend>
          {onFile ? (
            <ul className="onfile" aria-live="polite">
              <li className="ok">Phone: on file</li>
              <li className={onFile.email ? "ok" : "miss"}>Email: {onFile.email ? "on file" : "missing, please add it below"}</li>
              <li className={onFile.address ? "ok" : "miss"}>Address: {onFile.address ? "on file" : "missing, please add it below"}</li>
              <li className={onFile.vehicles ? "ok" : "miss"}>Vehicles: {onFile.vehicles ? `${onFile.vehicles} on file` : "none yet"}</li>
            </ul>
          ) : (
            <p className="fs-help">Optional. If we don't have your email or address, or yours has changed, add it here and we'll update your file.</p>
          )}
          <label className="fld"><span className="fl">Email</span><input id="b-email" value={f.email} onChange={set("email")} inputMode="email" autoComplete="email" /></label>
          <label className="fld"><span className="fl">Street address</span><input id="b-street" value={f.street} onChange={set("street")} autoComplete="street-address" /></label>
          <div className="two">
            <label className="fld"><span className="fl">Town</span><input id="b-city" value={f.city} onChange={set("city")} autoComplete="address-level2" /></label>
            <label className="fld"><span className="fl">{postalLabel}</span><input id="b-postal" value={f.postal} onChange={set("postal")} autoComplete="postal-code" /></label>
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend>Your vehicle</legend>
        {f.returning && <p className="fs-help">Which vehicle is coming in?</p>}
        {f.returning && onFile?.vehicleList?.length > 0 && (
          <div className="veh-pick" role="radiogroup" aria-label="Your vehicles on file">
            {onFile.vehicleList.map((v, i) => {
              const on = f.year === v.year && f.make === v.make && f.model === v.model;
              return (
                <button key={i} type="button" role="radio" aria-checked={on} className={"veh" + (on ? " on" : "")}
                  onClick={() => setF((o) => ({ ...o, year: v.year, make: v.make, model: v.model, plate: "" }))}>
                  {[v.year, v.make, v.model].filter(Boolean).join(" ")}
                </button>
              );
            })}
            <button type="button" role="radio" aria-checked={false} className="veh other"
              onClick={() => setF((o) => ({ ...o, year: "", make: "", model: "", plate: "" }))}>A different vehicle</button>
          </div>
        )}
        <div className="four">
          <label className="fld"><span className="fl">Year</span><input id="b-year" value={f.year} onChange={set("year")} inputMode="numeric" placeholder="2018" maxLength={4} required /></label>
          <label className="fld"><span className="fl">Make</span><input id="b-make" value={f.make} onChange={set("make")} placeholder="Toyota" required /></label>
          <label className="fld"><span className="fl">Model</span><input id="b-model" value={f.model} onChange={set("model")} placeholder="RAV4" required /></label>
          <label className="fld"><span className="fl">Plate <i>(optional)</i></span><input id="b-plate" value={f.plate} onChange={set("plate")} autoCapitalize="characters" /></label>
        </div>
        <label className="fld odo"><span className="fl">{odoUnit === "mi" ? "Miles" : "Kilometres"} on it <i>(optional, a rough number is fine)</i></span><input id="b-odo" value={f.odometer} onChange={set("odometer")} inputMode="numeric" placeholder={odoUnit === "mi" ? "92,000" : "148,000"} maxLength={9} /></label>
        <label className="fld"><span className="fl">{picked ? <>Anything else we should know? <i>(optional)</i></> : "What does it need?"}</span><textarea id="b-concern" value={f.concern} onChange={set("concern")} rows={4} placeholder={picked ? "Noises, warning lights, when it started…" : "Noise from the front when braking, check engine light on, oil change due…"} required={!picked} /></label>
      </fieldset>

      {checkin && (
        <fieldset>
          <legend>While we work on it</legend>
          <div className="radio-row" role="radiogroup" aria-label="Waiting or leaving the vehicle">
            {[["wait", "I'll wait"], ["drop", "I'm leaving it"], ["ride", "I need a ride"]].map(([v, l]) => (
              <label key={v} className="radio"><input type="radio" name="visit" value={v} checked={f.visit === v} onChange={set("visit")} />{l}</label>
            ))}
          </div>
        </fieldset>
      )}
      {!checkin && slot && (
        <fieldset>
          <legend>How should we confirm?</legend>
          <div className="radio-row" role="radiogroup" aria-label="Best way to reach you">
            {[["call", "Call me"], ["text", "Text me"], ["email", "Email me"]].map(([v, l]) => (
              <label key={v} className="radio"><input type="radio" name="contactBy" value={v} checked={f.contactBy === v} onChange={set("contactBy")} />{l}</label>
            ))}
          </div>
        </fieldset>
      )}
      {!checkin && !slot && (
        <fieldset>
          <legend>When suits you</legend>
          <div className="two">
            <label className="fld"><span className="fl">Preferred day <i>(optional)</i></span><input id="b-date" type="date" value={f.prefDate} onChange={set("prefDate")} min={today} max={max} /></label>
            <label className="fld"><span className="fl">Time of day</span><select id="b-time" value={f.prefTime} onChange={set("prefTime")}>
                <option value="any">Any time</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option>
              </select>
            </label>
          </div>
          <div className="radio-row" role="radiogroup" aria-label="Best way to reach you">
            <span>Best way to reach you:</span>
            {[["call", "Call"], ["text", "Text"], ["email", "Email"]].map(([v, l]) => (
              <label key={v} className="radio"><input type="radio" name="contactBy" value={v} checked={f.contactBy === v} onChange={set("contactBy")} />{l}</label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="hp" aria-hidden="true">
        <label>Leave this empty<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label>
      </div>

      <label className="consent">
        <input id="b-consent" type="checkbox" checked={f.consent} onChange={set("consent")} />
        <span>{shopName} can keep these details to contact me about my vehicle, including text messages about my appointment such as reminders. Message and data rates may apply. Reply STOP to opt out. My details won't be shared with anyone else.</span>
      </label>

      {err && <p className="book-err" role="alert" ref={errRef}>{err}{taken && <> <button type="button" className="bk-link" onClick={onTaken}>Pick another time</button></>}</p>}

      <button className="btn btn-call book-send" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : checkin ? "Check in" : slot ? `Book ${slot.label}` : "Send request"}
      </button>
      {tel && <p className="book-small">Rather talk to someone? Call <a href={`tel:${tel}`}>{phone}</a>.</p>}
    </form>
  );
}

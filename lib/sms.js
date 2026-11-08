import { createHmac, timingSafeEqual } from "node:crypto";
import { digits10 } from "./site";

// Text messages through Twilio's REST API (no package needed).
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM (+1XXXXXXXXXX).
//   TWILIO_FROM_CA / TWILIO_FROM_US can give Canadian and US shops their own number.
//   SMS_TEST=on: nothing is sent; texts are recorded as tests (for trying it out before Twilio is ready).
const env = (k) => (process.env[k] || "").trim();
export const smsConfigured = () => !!(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && (env("TWILIO_MESSAGING_SERVICE_SID") || env("TWILIO_FROM") || env("TWILIO_FROM_CA") || env("TWILIO_FROM_US")));
export const smsTest = () => env("SMS_TEST") === "on";
export const smsLive = () => smsConfigured() && !smsTest();
// Reminders run when texting is live, or in test mode.
export const smsOn = () => smsLive() || smsTest();

export const e164 = (p) => { const d = digits10(p); return d ? `+1${d}` : ""; };

export async function sendSms(to, body, { country = "CA" } = {}) {
  const num = e164(to);
  if (!num) throw new Error("No valid 10-digit phone number");
  if (!smsLive()) return { sid: `test-${Date.now().toString(36)}`, test: true };
  const sid = env("TWILIO_ACCOUNT_SID");
  const params = new URLSearchParams({ To: num, Body: body });
  const from = env(country === "US" ? "TWILIO_FROM_US" : "TWILIO_FROM_CA") || env("TWILIO_FROM");
  if (env("TWILIO_MESSAGING_SERVICE_SID")) params.set("MessagingServiceSid", env("TWILIO_MESSAGING_SERVICE_SID"));
  else params.set("From", from);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${env("TWILIO_AUTH_TOKEN")}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `Twilio error ${r.status}`);
  return { sid: j.sid, test: false };
}

// Twilio signs each webhook: base64(HMAC-SHA1(auth token, full URL + every POST field name and value, sorted by name)).
export function twilioSignatureOk(url, params, signature, token = env("TWILIO_AUTH_TOKEN")) {
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const want = createHmac("sha1", token).update(data, "utf8").digest("base64");
  const a = Buffer.from(want), b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}

// A TwiML reply (empty = no text back).
export const twiml = (message) => new Response(
  `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${String(message).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</Message>` : ""}</Response>`,
  { headers: { "Content-Type": "text/xml" } });

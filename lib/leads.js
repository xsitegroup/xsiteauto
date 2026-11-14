import { createHash, randomBytes } from "node:crypto";
import { digits10 } from "./site";
import { validRegion } from "./locale";
import { TECHS } from "./signup-check";
import { sendSystem } from "./system-mail";
import { APP_URL } from "./shop";

// "Send me more information": a short form, an email to confirm the address, then the guides.
const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com",
  "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mintemail.com"]);
const str = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export const INTERESTS = ["booking", "schedule", "quickbooks", "payments", "website", "reminders"];

// The files a confirmed lead receives. Kept in public/guides on the app.
export const GUIDES = (country) => [
  { name: "The Small Shop Playbook", file: country === "CA" ? "XSite-Auto-Small-Shop-Playbook-CA.pdf" : "XSite-Auto-Small-Shop-Playbook-US.pdf", note: "Where small shops lose money, how to run the day, and how to fill the schedule." },
  { name: "XSite Auto brochure", file: country === "CA" ? "XSite-Auto-Brochure-CA.pdf" : "XSite-Auto-Brochure-US.pdf", note: "What the software does, with pricing." },
];

export function checkLead(b) {
  const d = {
    name: str(b.name, 80), email: str(b.email, 120).toLowerCase(), phone: digits10(b.phone), shopName: str(b.shopName, 80),
    city: str(b.city, 60), country: b.country === "CA" ? "CA" : "US", region: str(b.region, 2).toUpperCase(),
    techs: TECHS.includes(b.techs) ? b.techs : "", software: str(b.software, 80), notes: str(b.notes, 600),
    interests: Array.isArray(b.interests) ? b.interests.filter((x) => INTERESTS.includes(x)) : [],
    agree: !!b.agree, source: str(b.source, 80),
  };
  const fail = (field, error) => ({ field, error });
  if (!d.name) return fail("name", "Please enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return fail("email", "That email address doesn't look right.");
  if (DISPOSABLE.has(d.email.split("@")[1])) return fail("email", "Please use your shop or personal email address.");
  if (!d.shopName) return fail("shopName", "Please enter your shop's name.");
  if (!d.phone) return fail("phone", "Please enter a 10-digit phone number.");
  if (!d.city) return fail("city", "Please enter your city.");
  if (!validRegion(d.country, d.region)) return fail("region", d.country === "CA" ? "Please choose a province." : "Please choose a state.");
  if (!d.techs) return fail("techs", "Please choose how many technicians you have.");
  if (!d.agree) return fail("agree", "Please tick the box so we can email you the guides.");
  d.phone = `${d.phone.slice(0, 3)}-${d.phone.slice(3, 6)}-${d.phone.slice(6)}`;
  return { ok: d };
}

export const newToken = () => randomBytes(24).toString("base64url");
export const tokenHash = (t) => createHash("sha256").update(`lead|${t}|${process.env.AUTH_SECRET || ""}`).digest("hex");
export const confirmLink = (t) => `${APP_URL()}/api/leads/verify?t=${encodeURIComponent(t)}`;
export const guideLink = (file) => `${APP_URL()}/guides/${file}`;

export const leadConfirmEmail = (to, name, link) => sendSystem({
  to, subject: "Confirm your email to get the XSite Auto guides",
  heading: "One click and they're yours",
  intro: `Hi ${name.split(" ")[0].replace(/[<>&"]/g, "")}, thanks for asking about XSite Auto. Confirm your email address and we'll send The Small Shop Playbook and our brochure straight away.`,
  buttons: [["Confirm and send my guides", link]],
  footer: "The link works for 7 days. If you didn't ask for this, you can ignore this email and you won't hear from us.",
});

export const leadGuidesEmail = (to, name, country) => sendSystem({
  to, subject: "Your XSite Auto guides",
  heading: "Here are your guides",
  intro: `Thanks, ${name.split(" ")[0].replace(/[<>&"]/g, "")}. Your email is confirmed. Both guides are below. If you'd like to see XSite Auto running with a shop like yours, reply to this email or call 905.346.0864 and we'll book a 15-minute demo.`,
  rows: GUIDES(country).map((g) => [g.name, g.note]),
  buttons: [...GUIDES(country).map((g) => [`Download ${g.name === "XSite Auto brochure" ? "the brochure" : "the Playbook"}`, guideLink(g.file)]),
    ["Start a free 14-day trial", `${APP_URL()}/signup?ref=guides`]],
  footer: "You're getting this because you asked for it on xsiteauto.com. We may follow up once or twice by email or phone. Reply \"stop\" and we won't contact you again.",
});

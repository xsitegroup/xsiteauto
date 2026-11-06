import { createHash } from "node:crypto";
import { digits10 } from "./site";
import { validRegion, postalOk, tidyPostal } from "./locale";

// Throwaway email services (a short list; Turnstile and the per-connection limit do most of the work).
const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com",
  "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mintemail.com"]);
const COMMON = new Set(["password", "password1", "password12", "password123", "1234567890", "12345678910", "qwertyuiop", "letmein123", "welcome123", "iloveyou12", "abc1234567"]);
const str = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export const TECHS = ["1", "2-3", "4-6", "7-10", "10+"];

// Returns { ok: data } or { error, field }.
export function checkSignup(b) {
  const d = {
    name: str(b.name, 80), mobile: digits10(b.mobile), email: str(b.email, 120).toLowerCase(), password: String(b.password || ""),
    shopName: str(b.shopName, 80), shopPhone: digits10(b.shopPhone), street: str(b.street, 120), city: str(b.city, 60),
    country: b.country === "CA" ? "CA" : "US", region: str(b.region, 2).toUpperCase(), postal: "", website: str(b.website, 200),
    techs: TECHS.includes(b.techs) ? b.techs : "", agree: !!b.agree, source: str(b.source, 60),
  };
  const fail = (field, error) => ({ field, error });
  if (!d.name) return fail("name", "Please enter your name.");
  if (!d.mobile) return fail("mobile", "Please enter a 10-digit mobile number.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return fail("email", "That email address doesn't look right.");
  if (DISPOSABLE.has(d.email.split("@")[1])) return fail("email", "Please use your shop or personal email address.");
  if (d.password.length < 10) return fail("password", "Use a password of at least 10 characters.");
  if (d.password.length > 200 || COMMON.has(d.password.toLowerCase())) return fail("password", "That password is too easy to guess. Try a longer one.");
  if (!d.shopName) return fail("shopName", "Please enter your shop's name.");
  if (!d.shopPhone) return fail("shopPhone", "Please enter the shop's 10-digit phone number.");
  if (!d.street || !d.city) return fail("street", "Please enter the shop's street address and city.");
  if (!validRegion(d.country, d.region)) return fail("region", d.country === "CA" ? "Please choose a province." : "Please choose a state.");
  if (!postalOk(d.country, b.postal)) return fail("postal", d.country === "CA" ? "Please enter a postal code like L0S 1E5." : "Please enter a 5-digit ZIP code.");
  d.postal = tidyPostal(d.country, b.postal);
  if (d.website) {
    let w = d.website; if (!/^https?:\/\//i.test(w)) w = "https://" + w;
    try { const u = new URL(w); if (!/\./.test(u.hostname)) throw 0; d.website = u.origin; } catch { return fail("website", "That website address doesn't look right. Leave it blank if you don't have one."); }
  }
  if (!d.techs) return fail("techs", "Please choose how many technicians you have.");
  if (!d.agree) return fail("agree", "Please tick the box to agree to the terms.");
  const fmt = (x) => `${x.slice(0, 3)}-${x.slice(3, 6)}-${x.slice(6)}`;
  d.mobile = fmt(d.mobile); d.shopPhone = fmt(d.shopPhone);
  return { ok: d };
}

export const codeHash = (id, code) => createHash("sha256").update(`${id}|${code}|${process.env.AUTH_SECRET || ""}`).digest("hex");

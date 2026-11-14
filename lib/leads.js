import { createHash, randomBytes } from "node:crypto";
import { digits10 } from "./site";
import { validRegion } from "./locale";
import { TECHS } from "./signup-check";
import { sendSystem } from "./system-mail";
import { esc } from "./mail";
import { APP_URL } from "./shop";

// "Send me more information": a short form, an email to confirm the address, then the guides.
const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com",
  "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mintemail.com"]);
const str = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export const INTERESTS = ["booking", "schedule", "quickbooks", "payments", "website", "reminders"];

// The white papers. Each shop picks the ones it wants; the brochure always goes with them.
export const PAPERS = [
  { key: "leaks", name: "Ten Places Small Shops Lose Money", file: "XSite-Auto-Ten-Places-Shops-Lose-Money.pdf", note: "The ten everyday leaks, what each one costs and how to fix it." },
  { key: "day", name: "Running the Day, From First Call to Close", file: "XSite-Auto-Running-the-Day.pdf", note: "A routine for the counter, the bays and the cash drawer, with printable sheets." },
  { key: "full", name: "Keeping the Schedule Full", file: "XSite-Auto-Keeping-the-Schedule-Full.pdf", note: "How customers find you, book you and come back, with templates and a 12-month calendar." },
  { key: "rate", name: "Setting Your Labour Rate", file: "XSite-Auto-Setting-Your-Labour-Rate.pdf", note: "Work out a rate that covers your costs and pays you, with a fill-in worksheet." },
  { key: "quotes", name: "Quotes That Get a Yes", file: "XSite-Auto-Quotes-That-Get-a-Yes.pdf", note: "Present estimates, sort repairs into now, soon and later, and handle \"too expensive.\"" },
  { key: "buying", name: "Choosing Shop Software: A Buyer's Checklist", file: "XSite-Auto-Choosing-Shop-Software.pdf", note: "The questions to ask any vendor, the red flags, and a scorecard." },
  { key: "switching", name: "Switching from Paper Without Losing a Day", file: "XSite-Auto-Switching-from-Paper.pdf", note: "A two-week plan to move your shop onto software, with checklists." },
];
const PAPER_KEYS = PAPERS.map((p) => p.key);

// The files a confirmed lead receives: the papers they chose, then the brochure. Kept in public/guides on the app.
export const GUIDES = (country, papers) => {
  const want = Array.isArray(papers) && papers.length ? papers : PAPER_KEYS;   // older requests: everything
  return [
    ...PAPERS.filter((p) => want.includes(p.key)),
    { key: "brochure", name: "XSite Auto brochure", file: "XSite-Auto-Brochure.pdf", note: "What the software does, with pricing." },
  ];
};

export function checkLead(b) {
  const d = {
    name: str(b.name, 80), email: str(b.email, 120).toLowerCase(), phone: digits10(b.phone), shopName: str(b.shopName, 80),
    city: str(b.city, 60), country: b.country === "CA" ? "CA" : "US", region: str(b.region, 2).toUpperCase(),
    techs: TECHS.includes(b.techs) ? b.techs : "", software: str(b.software, 80), notes: str(b.notes, 600),
    interests: Array.isArray(b.interests) ? b.interests.filter((x) => INTERESTS.includes(x)) : [],
    papers: Array.isArray(b.papers) ? PAPER_KEYS.filter((k) => b.papers.includes(k)) : [],
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
  if (!d.papers.length) return fail("papers", "Please choose at least one white paper.");
  if (!d.agree) return fail("agree", "Please tick the box so we can email you the white papers.");
  d.phone = `${d.phone.slice(0, 3)}-${d.phone.slice(3, 6)}-${d.phone.slice(6)}`;
  return { ok: d };
}

export const newToken = () => randomBytes(24).toString("base64url");
export const tokenHash = (t) => createHash("sha256").update(`lead|${t}|${process.env.AUTH_SECRET || ""}`).digest("hex");
export const confirmLink = (t) => `${APP_URL()}/api/leads/verify?t=${encodeURIComponent(t)}`;
export const guideLink = (file) => `${APP_URL()}/guides/${file}`;

// A plain bold link: looks the same in every email program, Outlook included.
const boldLink = (label, href) => `<a href="${esc(href)}" style="font-weight:700;color:#1A5FA8;text-decoration:underline;font-size:15px">${esc(label)}</a>`;

export const leadConfirmEmail = (to, name, link) => sendSystem({
  to, subject: "Confirm your email to get the XSite Auto white papers",
  heading: "One click and they're yours",
  intro: `Hi ${name.split(" ")[0].replace(/[<>&"]/g, "")}, thanks for asking about XSite Auto. Confirm your email address and we'll send our white papers and brochure straight away.<br><br><span style="font-size:16px">${boldLink("Confirm and send my white papers", link)}</span>`,
  footer: "The link works for 7 days. If you didn't ask for this, you can ignore this email and you won't hear from us.",
});

export const leadGuidesEmail = (to, name, country, papers) => sendSystem({
  to, subject: "Your XSite Auto white papers",
  heading: "Here are your white papers",
  intro: `Thanks, ${name.split(" ")[0].replace(/[<>&"]/g, "")}. Your email is confirmed. Your white papers and our brochure are below. If you'd like to see XSite Auto running with a shop like yours, reply to this email or call 905.346.0864 and we'll book a 15-minute demo.`,
  rows: GUIDES(country, papers).map((g) => [g.key === "brochure" ? "Brochure" : "White paper",
    `<div style="font-size:16px;font-weight:700;color:#111a23">${esc(g.name)}</div><div style="font-weight:400;color:#3d4954;margin:2px 0 10px;font-size:14px;line-height:1.45">${esc(g.note)}</div>${boldLink("Download PDF", guideLink(g.file))}`]),
  footer: `<span style="font-size:15px">Ready to try it? ${boldLink("Start a free 14-day trial", `${APP_URL()}/signup?ref=guides`)}</span><br><br>` +
    "You're getting this because you asked for it on xsiteauto.com. We may follow up once or twice by email or phone. Reply \"stop\" and we won't contact you again.",
});

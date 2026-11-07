import { sendSystem } from "./system-mail";
import { esc } from "./mail";
import { bookingUrl, APP_URL } from "./shop";

// The emails a trial shop gets. The nightly job decides who gets which (see app/api/cron/daily).
const first = (n) => esc(String(n || "").split(" ")[0] || "there");
const fmtDay = (d, tz) => new Date(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz || "America/New_York" });
const PHONE = "905.346.0864";
const calLink = () => process.env.SETUP_CALL_URL || "";

export const TRIAL_EMAILS = {
  welcome: ({ shop, owner }) => sendSystem({
    to: owner.email, subject: `Welcome to XSite Auto, ${String(owner.name || "").split(" ")[0] || shop.name}`,
    heading: `${shop.name} is ready`,
    intro: `Hi ${first(owner.name)}, your free trial runs until <b>${esc(fmtDay(shop.trial_ends_at, shop.timezone))}</b>. Three things get the most out of it:`,
    rows: [["1", "Add online booking to your website (one line of code)"], ["2", "Bring in your customers from QuickBooks"], ["3", "Book tomorrow's first job"]],
    buttons: [["Open XSite Auto", APP_URL() + "/#setup"], ...(calLink() ? [["Book a 15-minute setup call", calLink()]] : [])],
    footer: `Your booking page is already live: <a href="${esc(bookingUrl(shop.slug))}">${esc(bookingUrl(shop.slug).replace("https://", ""))}</a>. Questions? Reply to this email or call ${PHONE}.`,
  }),
  booking: ({ shop, owner }) => sendSystem({
    to: owner.email, subject: "Put online booking on your website",
    heading: "Let customers book themselves",
    intro: `Hi ${first(owner.name)}, the booking form isn't on your website yet. It takes one line of code, and we show you exactly where it goes for WordPress, Wix, GoDaddy and Squarespace.`,
    buttons: [["Add it to my website", APP_URL() + "/#booking"]],
    footer: `Not sure how to edit your site? Use "Send to my web person" on that screen, or call us at ${PHONE}.`,
  }),
  import: ({ shop, owner }) => sendSystem({
    to: owner.email, subject: "Bring your customers over from QuickBooks",
    heading: "Your customers, already loaded",
    intro: `Hi ${first(owner.name)}, export your customer list from QuickBooks and upload it to XSite Auto. You'll see everything before it's saved, and you can undo it.`,
    buttons: [["Import my customers", APP_URL() + "/#import"]],
  }),
  checkin: ({ shop, owner }) => sendSystem({
    to: owner.email, subject: `How's XSite Auto working at ${shop.name}?`,
    heading: "A week in",
    intro: `Hi ${first(owner.name)}, it's David from XSite. You're halfway through your trial and I wanted to check how it's going. If anything's getting in the way, a 15-minute call usually sorts it out.`,
    buttons: calLink() ? [["Pick a time", calLink()]] : [],
    footer: `Or just reply to this email, or call me at ${PHONE}.`,
  }),
  ending: ({ shop, owner, stats }) => sendSystem({
    to: owner.email, subject: "3 days left in your XSite Auto trial",
    heading: "3 days left",
    intro: `Hi ${first(owner.name)}, your trial ends on <b>${esc(fmtDay(shop.trial_ends_at, shop.timezone))}</b>. Here's what ${esc(shop.name)} has done so far:`,
    rows: [["Online bookings", String(stats.bookings)], ["Jobs on the board", String(stats.jobs)], ["Customers on file", String(stats.customers)]],
    buttons: [["Keep XSite Auto", APP_URL() + "/#billing"]],
    footer: shop.country === "CA"
      ? "Keeping it is $139 CAD a month, with a free welcome call. No long-term contract. Want us to do the setup for you? Add Done-for-you setup for $695 CAD one time."
      : "Keeping it is $99 USD a month, with a free welcome call. No long-term contract. Want us to do the setup for you? Add Done-for-you setup for $495 USD one time.",
  }),
  ended: ({ shop, owner }) => sendSystem({
    to: owner.email, subject: "Your XSite Auto trial has ended",
    heading: "Your trial has ended",
    intro: `Hi ${first(owner.name)}, ${esc(shop.name)}'s account is now read-only. Your customers and jobs are safe for 30 days, and you can still sign in and export them. Your booking form now asks customers to call you, so your website keeps working.`,
    buttons: [["Keep XSite Auto", APP_URL() + "/#billing"]],
    footer: `Questions? Call ${PHONE}.`,
  }),
  final: ({ shop, owner }) => sendSystem({
    to: owner.email, subject: "Final notice: your XSite Auto data",
    heading: "Your data will be deleted in 4 days",
    intro: `Hi ${first(owner.name)}, ${esc(shop.name)}'s trial ended a while ago. In 4 days we'll delete its customers and jobs. Sign in to export them, or keep XSite Auto to carry on where you left off.`,
    buttons: [["Sign in", APP_URL() + "/#billing"]],
  }),
};

import { sendMail, emailLayout, esc } from "./mail";

// Tells XSite about new trials, conversions and the daily summary:
//  - an email to SALES_EMAIL (default david@xsitegroup.ca)
//  - a POST to XSite Command, when COMMAND_WEBHOOK_URL is set (Bearer COMMAND_WEBHOOK_TOKEN)
// Never throws: a hiccup here must not break a signup or a payment.
export const salesEmail = () => process.env.SALES_EMAIL || "david@xsitegroup.ca";

export async function notifyXSite(event, { subject, heading, intro, rows = [], data = {} }) {
  const jobs = [];
  jobs.push(sendMail({
    to: salesEmail(),
    fromName: "XSite Auto",
    subject,
    html: emailLayout({ shopName: "XSite Auto", heading, intro, rows: rows.map(([k, v]) => [k, esc(v)]), accent: "#1A5FA8", accentInk: "#ffffff", signoff: "XSite Auto notification" }),
  }));
  if (process.env.COMMAND_WEBHOOK_URL) {
    jobs.push(fetch(process.env.COMMAND_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.COMMAND_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.COMMAND_WEBHOOK_TOKEN}` } : {}) },
      body: JSON.stringify({ source: "xsite-auto", event, at: new Date().toISOString(), ...data }),
      signal: AbortSignal.timeout(6000),
    }).then((r) => { if (!r.ok) throw new Error("XSite Command answered " + r.status); }));
  }
  const res = await Promise.allSettled(jobs);
  res.forEach((x) => { if (x.status === "rejected") console.error("notifyXSite:", x.reason?.message); });
}

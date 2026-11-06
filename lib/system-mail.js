import { sendMail, emailLayout, esc } from "./mail";

// Emails from XSite Auto itself (sign-up codes, password resets, invites, trial emails), in XSite blue.
const BLUE = "#1A5FA8";
export const xsiteLayout = (o) => emailLayout({ shopName: "XSite Auto", accent: BLUE, accentInk: "#ffffff", signoff: "XSite Auto · XSite Group Inc. · Fonthill, ON · 905.346.0864", ...o });

export function sendSystem({ to, subject, heading, intro, rows, buttons, footer, replyTo }) {
  return sendMail({
    to, subject, fromName: "XSite Auto", replyTo: replyTo || process.env.SALES_EMAIL || "david@xsitegroup.ca",
    html: xsiteLayout({ heading, intro, rows, buttons, footer }),
  });
}

export const signupCodeEmail = (to, code) => sendSystem({
  to, subject: `${code} is your XSite Auto code`,
  heading: "Confirm your email",
  intro: `Enter this code to finish setting up your free trial:<br><span style="display:inline-block;margin-top:12px;font-size:32px;letter-spacing:.2em;font-weight:800;color:#0E2A4F">${esc(code)}</span>`,
  footer: "The code works for 15 minutes. If you didn't sign up for XSite Auto, you can ignore this email.",
});

export const resetEmail = (to, link) => sendSystem({
  to, subject: "Reset your XSite Auto password",
  heading: "Reset your password",
  intro: "Use the button below to choose a new password. The link works for one hour.",
  buttons: [["Choose a new password", link]],
  footer: "If you didn't ask for this, you can ignore this email. Your password won't change.",
});

export const inviteEmail = (to, { shopName, from, link }) => sendSystem({
  to, subject: `${from} invited you to ${shopName} on XSite Auto`,
  heading: `Join ${shopName} on XSite Auto`,
  intro: `${esc(from)} added you to the shop's XSite Auto account. Choose a password to get started.`,
  buttons: [["Accept the invite", link]],
  footer: "The link works for 7 days.",
});

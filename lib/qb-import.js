import { digits10 } from "./site";
import { tidyPostal } from "./locale";

// Turns a QuickBooks customer export (Online or Desktop, CSV or Excel) into XSite Auto customers.
// QuickBooks puts a title or blank rows above the headers, so the header row is found by its names.

const FIELDS = {
  name: ["name", "customer", "customer name", "full name", "display name", "customer full name", "customer:job"],
  company: ["company", "company name"],
  first: ["first name"], last: ["last name"],
  email: ["email", "main email", "e-mail", "email address", "primary email"],
  phone: ["phone", "main phone", "phone numbers", "primary phone", "phone number", "work phone"],
  mobile: ["mobile", "mobile phone", "cell", "cell phone"],
  street: ["billing street", "street", "bill to 1", "billing address line 1", "address", "billing address", "bill street1", "street address"],
  street2: ["bill to 2", "billing address line 2", "bill street2"],
  city: ["billing city", "city", "bill city"],
  region: ["billing state", "state", "province", "billing province", "bill state", "billing state/province"],
  postal: ["billing zip", "zip", "postal code", "zip code", "billing zip/postal code", "bill zip", "billing postal code"],
  balance: ["open balance", "balance", "balance total", "total balance"],
  active: ["active status", "status", "active"],
  notes: ["notes", "note"],
};
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9:/]+/g, " ").trim();

export function findColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const heads = rows[r].map(norm);
    const col = {};
    for (const [k, names] of Object.entries(FIELDS)) {
      const i = heads.findIndex((h) => names.includes(h));
      if (i >= 0) col[k] = i;
    }
    if ((col.name !== undefined || col.company !== undefined || col.first !== undefined) && (col.phone !== undefined || col.email !== undefined || col.mobile !== undefined)) {
      return { headerRow: r, col, headers: rows[r] };
    }
  }
  return null;
}

const money = (s) => { const n = parseFloat(String(s || "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1")); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const tidyName = (n) => {
  n = String(n || "").replace(/\s+/g, " ").trim();
  if (!n || (n !== n.toUpperCase() && n !== n.toLowerCase())) return n;
  return n.toLowerCase().replace(/(^|[\s\-'’])([a-z])/g, (m, a, b) => a + b.toUpperCase());
};
const fmtPhone = (p) => { const x = digits10(p); return x ? `${x.slice(0, 3)}-${x.slice(3, 6)}-${x.slice(6)}` : ""; };

// One customer per data row: { row, name, phone, email, street, city, postal, balance, inactive } or { row, skip: reason }.
export function toCustomers(rows, found, country) {
  const { headerRow, col } = found;
  const get = (r, k) => (col[k] === undefined ? "" : String(r[col[k]] ?? "").trim());
  const out = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    // Prefer "First Last" when QuickBooks has both (Desktop's Customer column is often "Last First" or "Last, First").
    let name = get(r, "first") && get(r, "last") ? `${get(r, "first")} ${get(r, "last")}` : get(r, "name");
    if (name.includes(":")) name = name.split(":")[0].trim();          // Desktop "Customer:Job" -> customer
    const lf = /^([A-Za-z'’\-]+),\s*([A-Za-z'’\-. ]+)$/.exec(name);
    if (lf && !get(r, "company")) name = `${lf[2]} ${lf[1]}`;
    if (!name) name = get(r, "company");
    name = tidyName(name);
    if (!name || /^(total|totals)\b/i.test(name)) continue;
    const phone = fmtPhone(get(r, "phone")) || fmtPhone(get(r, "mobile"));
    const email = get(r, "email").split(/[;,\s]+/)[0].toLowerCase();
    const c = {
      row: i + 1, name, phone, email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "",
      street: [get(r, "street"), get(r, "street2")].filter(Boolean).join(", ").slice(0, 120),
      city: tidyName(get(r, "city")).slice(0, 60), postal: tidyPostal(country, get(r, "postal")),
      company: get(r, "company").slice(0, 80), balance: money(get(r, "balance")),
      inactive: /^(inactive|no|false|0)$/i.test(get(r, "active")), notes: get(r, "notes").slice(0, 500),
    };
    if (!c.phone && !c.email) c.skip = "No phone or email";
    out.push(c);
  }
  return out;
}

// Decide what happens to each row: new customer, merge into an existing one, or skip.
export function plan(cands, existing, { skipInactive = true, merge = true } = {}) {
  const byPhone = new Map(), byEmail = new Map();
  for (const e of existing) {
    const d = digits10(e.phone); if (d) byPhone.set(d, e);
    const m = String(e.email || "").toLowerCase(); if (m) byEmail.set(m, e);
  }
  const seenPhone = new Set(), seenEmail = new Set();
  return cands.map((c) => {
    if (c.skip) return { ...c, action: "skip", reason: c.skip };
    if (skipInactive && c.inactive) return { ...c, action: "skip", reason: "Inactive in QuickBooks" };
    const d = digits10(c.phone);
    if ((d && seenPhone.has(d)) || (c.email && seenEmail.has(c.email))) return { ...c, action: "skip", reason: "Listed twice in the file" };
    if (d) seenPhone.add(d); if (c.email) seenEmail.add(c.email);
    const match = (d && byPhone.get(d)) || (c.email && byEmail.get(c.email));
    if (match) return merge ? { ...c, action: "merge", into: match.id, intoName: match.name } : { ...c, action: "skip", reason: "Already in XSite Auto" };
    return { ...c, action: "new" };
  });
}

// Country, state/province, time zone and sales-tax starting points for a new shop.
// The shop confirms its tax rate in the setup checklist; these are only defaults.

export const CA_REGIONS = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador",
  NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island",
  QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
};
export const US_REGIONS = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// Canadian sales tax by province: [name, rate]. Starting points only.
const CA_TAX = {
  ON: ["HST", 13], NB: ["HST", 15], NS: ["HST", 14], NL: ["HST", 15], PE: ["HST", 15],
  QC: ["GST + QST", 14.975], BC: ["GST + PST", 12], MB: ["GST + PST", 12], SK: ["GST + PST", 11],
  AB: ["GST", 5], YT: ["GST", 5], NT: ["GST", 5], NU: ["GST", 5],
};

const TZ = {
  // Canada
  BC: "America/Vancouver", YT: "America/Whitehorse", AB: "America/Edmonton", NT: "America/Yellowknife",
  SK: "America/Regina", MB: "America/Winnipeg", ON: "America/Toronto", QC: "America/Toronto", NU: "America/Iqaluit",
  NB: "America/Moncton", NS: "America/Halifax", PE: "America/Halifax", NL: "America/St_Johns",
  // United States (the zone most of the state uses)
  AZ: "America/Phoenix", AK: "America/Anchorage", HI: "Pacific/Honolulu",
  CA_US: "America/Los_Angeles", WA: "America/Los_Angeles", OR: "America/Los_Angeles", NV: "America/Los_Angeles",
  ID: "America/Boise", MT: "America/Denver", WY: "America/Denver", UT: "America/Denver", CO: "America/Denver", NM: "America/Denver",
  ND: "America/Chicago", SD: "America/Chicago", NE: "America/Chicago", KS: "America/Chicago", OK: "America/Chicago",
  TX: "America/Chicago", MN: "America/Chicago", IA: "America/Chicago", MO: "America/Chicago", AR: "America/Chicago",
  LA: "America/Chicago", WI: "America/Chicago", IL: "America/Chicago", MS: "America/Chicago", AL: "America/Chicago",
  TN: "America/Chicago", KY: "America/New_York", IN: "America/Indiana/Indianapolis", MI: "America/Detroit",
};

export function regionsFor(country) { return country === "CA" ? CA_REGIONS : US_REGIONS; }
export function validRegion(country, region) { return !!regionsFor(country)[region]; }

export function timeZoneFor(country, region) {
  if (country === "US" && region === "CA") return TZ.CA_US;
  return TZ[region] || (country === "CA" ? "America/Toronto" : "America/New_York");
}

export function taxFor(country, region) {
  if (country === "CA") { const t = CA_TAX[region] || ["GST", 5]; return { taxName: t[0], taxRate: t[1] }; }
  return { taxName: "Sales tax", taxRate: "" };   // US: the shop enters its own combined rate
}

export function postalOk(country, z) {
  const c = String(z || "").replace(/\s/g, "").toUpperCase();
  return country === "CA" ? /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(c) : /^\d{5}(-?\d{4})?$/.test(c);
}
export function tidyPostal(country, z) {
  const c = String(z || "").replace(/\s/g, "").toUpperCase();
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(c)) return `${c.slice(0, 3)} ${c.slice(3)}`;
  if (/^\d{9}$/.test(c)) return `${c.slice(0, 5)}-${c.slice(5)}`;
  return String(z || "").trim().slice(0, 10);
}
export const postalLabel = (country) => (country === "CA" ? "Postal code" : "ZIP code");
export const regionLabel = (country) => (country === "CA" ? "Province" : "State");

// 11:59 pm shop time, `days` days from today in that time zone (the end of a trial).
export function endOfLocalDay(days, timeZone) {
  const now = new Date();
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  const guess = Date.UTC(+p.year, +p.month - 1, +p.day + days, 23, 59, 59);
  const q = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asLocal = Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute, +q.second);
  return new Date(guess - (asLocal - guess));
}

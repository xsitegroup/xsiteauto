// Website content for shops. BLANK_SITE fills gaps when showing a site; newShopSite() is the
// starter content a new trial shop gets, written in plain terms so it's true for any shop.
// (lib/site-defaults.json is Forks Auto Repair's original content, used only by the upgrade script.)

const HOURS = [
  { day: "Monday", closed: false, open: "08:00", close: "17:00" },
  { day: "Tuesday", closed: false, open: "08:00", close: "17:00" },
  { day: "Wednesday", closed: false, open: "08:00", close: "17:00" },
  { day: "Thursday", closed: false, open: "08:00", close: "17:00" },
  { day: "Friday", closed: false, open: "08:00", close: "17:00" },
  { day: "Saturday", closed: true, open: "", close: "" },
  { day: "Sunday", closed: true, open: "", close: "" },
];

export const BLANK_SITE = {
  published: false, headline: "", intro: "", about: "", aboutPhoto: "", phone: "", textPhone: "", email: "",
  street: "", town: "", province: "", postal: "", hours: HOURS, hoursNote: "", services: [], priceNote: "",
  photos: [], googleReviewsUrl: "", googlePlaceId: "", facebookUrl: "", instagramUrl: "",
  banner: { on: false, text: "", linkText: "", link: "/book" }, heroPhoto: "", proof: [],
  specialtiesTitle: "", specialtiesIntro: "", specialties: [], beforeAfter: [], aboutTitle: "", credentials: "",
  faqs: [], featuredReviews: [],
};

const SERVICES = [
  ["Oil and filter change", "Conventional or synthetic, with a multi-point inspection"],
  ["Brake pads and rotors", "Per axle, parts and labour"],
  ["Check engine light diagnosis", "We find the cause and explain it before any repair"],
  ["Tire changeover", "Seasonal swap and balance"],
  ["Battery test and replacement", "Tested first, replaced only if it needs it"],
  ["Suspension and steering", "Noises, pulling, worn parts"],
  ["Scheduled maintenance", "Following your manufacturer's schedule"],
];

export function newShopSite({ name, phone, email, street, town, region, postal, taxName }) {
  const where = town ? ` in ${town}` : "";
  return {
    ...BLANK_SITE,
    headline: `Honest auto repair${where}.`,
    intro: `${name} is an independent repair shop${where}. Book a drop-off online any time and we'll confirm by call, text or email.`,
    about: "",
    aboutTitle: `About ${name}`,
    phone: phone || "", email: email || "", street: street || "", town: town || "", province: region || "", postal: postal || "",
    services: SERVICES.map(([n, d]) => ({ name: n, price: "", from: true, desc: d })),
    priceNote: `Prices before ${taxName || "tax"}. Final cost depends on your vehicle, and you'll get an estimate before work starts.`,
    proof: ["Estimate before any work starts", "Straight answers and fair prices", "Book online, day or night", "Independent and local"],
    faqs: [
      { q: "Will I know the price before you start?", a: "Yes. You get an estimate before any work starts, and we call you before doing anything that wasn't on it." },
      { q: "Can I book online?", a: "Yes. Pick a drop-off time on our booking page and we'll confirm it with you." },
    ],
  };
}

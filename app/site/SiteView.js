import "./site.css";
import { fmtPhone, telHref, socialUrl } from "@/lib/site";
import OpenNow from "./OpenNow";
import BeforeAfter from "./BeforeAfter";

export function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  const hh = ((h + 11) % 12) + 1;
  return m ? `${hh}:${String(m).padStart(2, "0")}${ap}` : `${hh}${ap}`;
}
export function fmtPrice(s) {
  const p = String(s.price || "").trim();
  if (!p) return { text: "Call for a quote", quote: true };
  const n = p.replace(/[$,\s]/g, "");
  if (/^\d+(\.\d{1,2})?$/.test(n)) {
    const v = Number(n);
    const money = "$" + (Number.isInteger(v) ? v.toLocaleString("en-CA") : v.toLocaleString("en-CA", { minimumFractionDigits: 2 }));
    return { text: money, from: !!s.from };
  }
  return { text: p, from: !!s.from };
}
const paras = (t) => String(t || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
const clean = (v) => String(v || "").trim().replace(/[,\s]+$/, "");
export const addressLine = (s) => [clean(s.street), [clean(s.town), clean(s.province)].filter(Boolean).join(", "), clean(s.postal)].filter(Boolean).join(", ");
export const has = (v) => !!String(v || "").trim();

// "Dealer-level repairs, without the dealer." -> ["Dealer-level repairs,", "without the dealer."]
function splitHeadline(h) {
  const t = String(h || "").trim();
  const m = t.match(/^(.+?[.,!?])\s+(.+)$/);
  return m ? [m[1], m[2]] : [t, ""];
}

function jsonLd(site) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return {
    "@context": "https://schema.org",
    "@type": "AutoRepair",
    name: site.shopName,
    description: site.intro,
    telephone: telHref(site.phone) || undefined,
    email: site.email || undefined,
    image: site.heroPhoto || site.aboutPhoto || undefined,
    address: site.street ? { "@type": "PostalAddress", streetAddress: clean(site.street), addressLocality: site.town, addressRegion: site.province, postalCode: site.postal, addressCountry: site.country || "CA" } : undefined,
    sameAs: [socialUrl(site.facebookUrl, "facebook.com"), socialUrl(site.instagramUrl, "instagram.com")].filter(Boolean),
    openingHoursSpecification: site.hours.map((h, i) => (h.closed || !h.open || !h.close) ? null : ({ "@type": "OpeningHoursSpecification", dayOfWeek: days[i], opens: h.open, closes: h.close })).filter(Boolean),
  };
}
function faqLd(faqs) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}


// A shop's own colours: site.theme ("dark" or "light", otherwise follows the visitor's device) and
// site.accent (#rrggbb, replaces the amber). Written as a <style> after site.css so it wins.
const LIGHT_VARS = "--paper:#eef1f4;--surface:#ffffff;--ink:#111a23;--ink-2:#3d4954;--muted:#56636f;--line:#d4dbe2;--signal:#e8961f;--signal-text:#a8620a;--signal-ink:#111a23;--link:#1d5ea6;--board:#16202a;--board-ink:#f1f4f7;--board-muted:#9fb0bf;--board-line:#2d3b48;--night:#111a23;--night-ink:#eef1f4;--night-muted:#a7b4c0;--good:#22714a;color-scheme:light;";
const DARK_VARS = "--paper:#0d1318;--surface:#151e27;--ink:#e6ebf0;--ink-2:#c3ccd5;--muted:#95a3b1;--line:#26323d;--signal:#f0a443;--signal-text:#f0a443;--signal-ink:#111a23;--link:#74aef0;--board:#0a1016;--board-ink:#eef2f5;--board-muted:#8fa1b1;--board-line:#24313d;--night:#070b0f;--night-ink:#e6ebf0;--night-muted:#95a3b1;--good:#5cc48a;color-scheme:dark;";
function accentVars(hex, dark) {
  const n = parseInt(hex.slice(1), 16), rgb = [n >> 16, (n >> 8) & 255, n & 255];
  const lum = rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  const ink = L > 0.35 ? "#111a23" : "#ffffff";
  // On light backgrounds, text in the accent colour is darkened so it stays readable.
  const text = dark ? hex : "#" + rgb.map((c) => Math.round(c * 0.62).toString(16).padStart(2, "0")).join("");
  return `--signal:${hex};--signal-text:${text};--signal-ink:${ink};`;
}
export function themeCss(site) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(site?.accent || "") ? site.accent.toLowerCase() : "";
  const mode = site?.theme === "dark" || site?.theme === "light" ? site.theme : "";
  if (!accent && !mode) return "";
  if (mode) return `:root{${mode === "dark" ? DARK_VARS : LIGHT_VARS}${accent ? accentVars(accent, mode === "dark") : ""}}`;
  return `:root{${accentVars(accent, false)}}@media (prefers-color-scheme: dark){:root{${accentVars(accent, true)}}}`;
}
export function SiteTheme({ site }) {
  const css = themeCss(site);
  return css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null;
}

export function ComingSoon({ site }) {
  const tel = telHref(site.phone);
  return (
    <main className="soon">
      <SiteTheme site={site} />
      <div className="soon-in">
        <p className="eyebrow">{site.town ? `Auto repair · ${site.town}` : "Auto repair"}</p>
        <h1 className="wordmark">{site.shopName}</h1>
        <p className="lede">Our website is on its way.</p>
        {tel && <a className="btn btn-call" href={`tel:${tel}`}>Call {fmtPhone(site.phone)}</a>}
      </div>
    </main>
  );
}

const PROOF_ICONS = ["wrench", "doc", "chat", "pin"];

export default function SiteView({ site, reviews, preview = false }) {
  const tel = telHref(site.phone);
  const sms = telHref(site.textPhone) || tel;
  const addr = addressLine(site);
  const mapQ = encodeURIComponent([site.shopName, addr].filter(Boolean).join(", "));
  const directions = addr ? `https://www.google.com/maps/dir/?api=1&destination=${mapQ}` : "";
  const services = site.services.filter((s) => has(s.name));
  const photos = site.photos.filter((p) => p.url);
  const specialties = (site.specialties || []).filter((s) => has(s.title));
  const jobs = (site.beforeAfter || []).filter((j) => j.before && j.after);
  const faqs = (site.faqs || []).filter((f) => has(f.q) && has(f.a));
  const proof = (site.proof || []).filter(has).slice(0, 4);
  const hoursForClock = site.hours.map((h) => ({ closed: !!h.closed, open: h.open || "", close: h.close || "" }));
  const year = new Date().getFullYear();
  const fb = socialUrl(site.facebookUrl, "facebook.com");
  const ig = socialUrl(site.instagramUrl, "instagram.com");
  const [h1a, h1b] = splitHeadline(site.headline);
  const rating = reviews?.rating ? { rating: reviews.rating, count: reviews.count } : null;
  // live Google reviews when the API key is set, otherwise the ones picked in the Website tab
  const liveReviews = reviews?.reviews?.length > 0;
  const reviewList = liveReviews ? reviews.reviews
    : (site.featuredReviews || []).filter((r) => has(r.text)).slice(0, 6).map((r) => ({ rating: Number(r.stars) || 5, text: r.text.trim(), author: has(r.author) ? r.author : "Google review" }));
  const banner = site.banner && site.banner.on && has(site.banner.text) ? site.banner : null;
  const where = [site.town, site.province].filter(has).join(", ");

  // Proof strip: the live Google rating (when connected) takes the second slot.
  const proofItems = proof.map((t, i) => ({ text: t, icon: PROOF_ICONS[i % 4] }));
  if (rating) proofItems.splice(1, 0, { text: `${rating.rating.toFixed(1)} from ${rating.count} Google review${rating.count === 1 ? "" : "s"}`, icon: "star" });
  const proofShown = proofItems.slice(0, 4);

  return (
    <>
      <SiteTheme site={site} />
      {preview && (
        <div className="preview-bar">Preview{site.published ? " · this is what visitors see" : " · not published yet, visitors see a coming-soon page"}</div>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(site)) }} />
      {faqs.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd(faqs)) }} />}

      {banner && (
        <div className="banner">
          <div className="wrap banner-in">
            <span>{banner.text}</span>
            {has(banner.linkText) && <a href={banner.link || "/book"}>{banner.linkText}</a>}
          </div>
        </div>
      )}

      <header className="top">
        <div className="wrap top-in">
          <a className="mark" href="#top">{site.shopName}</a>
          <nav className="links" aria-label="Sections">
            {specialties.length > 0 && <a href="#specialties">Specialties</a>}
            {services.length > 0 && <a href="#prices">Services &amp; prices</a>}
            {(rating || site.googleReviewsUrl) && <a href="#reviews">Reviews</a>}
            <a href="#visit">Visit</a>
          </nav>
          {tel && <a className="top-phone" href={`tel:${tel}`}>{fmtPhone(site.phone)}</a>}
          <a className="top-book" href="/book">Book online</a>
        </div>
      </header>

      <main id="top">
        {/* hero */}
        <section className="hero">
          <div className="wrap hero-in with-photo">
            <div className="hero-text">
              <p className="eyebrow">{where ? `Auto repair · ${where}` : "Independent auto repair"}</p>
              <h1 className="headline">{h1a}{h1b && <><br /><span>{h1b}</span></>}</h1>
              {has(site.intro) && <p className="lede">{site.intro}</p>}
              <OpenNow hours={hoursForClock} timeZone={site.timeZone} />
              <div className="cta">
                {tel && <a className="btn btn-call" href={`tel:${tel}`}><PhoneIcon />Call {fmtPhone(site.phone)}</a>}
                <a className="btn btn-line" href="/book"><CalIcon />Book online</a>
                {sms && <a className="btn btn-quiet" href={`sms:${sms}`}><TextIcon />Text us</a>}
              </div>
            </div>
            {site.heroPhoto ? (
              <div className="hero-photo">
                <img src={site.heroPhoto} alt={`${site.shopName}: in the shop`} />
              </div>
            ) : (
              <div className="hero-photo hero-art"><HeroArt town={site.town} name={site.shopName} /></div>
            )}
          </div>
        </section>

        {/* proof strip */}
        {proofShown.length > 0 && (
          <section className="proof" aria-label={`Why ${site.shopName}`}>
            <ul className="wrap proof-in">
              {proofShown.map((p, i) => (
                <li key={i}><Icon name={p.icon} />{p.icon === "star" && <span className="proof-stars" aria-hidden="true">★★★★★</span>}<span>{p.text}</span></li>
              ))}
            </ul>
          </section>
        )}

        {/* specialties */}
        {specialties.length > 0 && (
          <section id="specialties" className="spec">
            <div className="wrap">
              <div className="sec-head">
                <h2>{site.specialtiesTitle || "What we're known for"}</h2>
                {has(site.specialtiesIntro) && <p>{site.specialtiesIntro}</p>}
              </div>
              <div className="spec-grid">
                {specialties.map((s, i) => (
                  <article key={i} className="spec-card">
                    {s.photo
                      ? <img className="spec-img" src={s.photo} alt="" loading="lazy" />
                      : <div className={"spec-art art-" + (i % 3)} aria-hidden="true"><Icon name={["manifold", "toyota", "bolt"][i % 3]} /></div>}
                    <div className="spec-body">
                      <h3>{s.title}</h3>
                      {has(s.desc) && <p>{s.desc}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* before & after */}
        {jobs.length > 0 && (
          <section id="work" className="ba">
            <div className="wrap">
              <BeforeAfter jobs={jobs.map((j) => ({ label: j.label || j.title, title: j.title || j.label, text: j.text || "", before: j.before, after: j.after }))} />
            </div>
          </section>
        )}

        {/* price board */}
        {services.length > 0 && (
          <section id="prices" className="board-wrap">
            <div className="wrap">
              <div className="board">
                <div className="board-head">
                  <h2>Services &amp; prices</h2>
                  <span className="board-tag">Service menu</span>
                </div>
                <ul className="menu">
                  {services.map((s, i) => {
                    const p = fmtPrice(s);
                    return (
                      <li key={i}>
                        <div className="menu-row">
                          <span className="menu-name">{s.name}</span>
                          <span className="leader" aria-hidden="true" />
                          <span className={"menu-price" + (p.quote ? " quote" : "")}>{p.from && <small>from </small>}{p.text}</span>
                        </div>
                        {s.desc && <p className="menu-desc">{s.desc}</p>}
                      </li>
                    );
                  })}
                </ul>
                <div className="board-foot">
                  {site.priceNote && <p className="board-note">{site.priceNote}</p>}
                  <a className="btn btn-call" href="/book"><CalIcon />Book a repair</a>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* reviews */}
        {(reviewList.length > 0 || site.googleReviewsUrl) && (
          <section id="reviews" className="reviews">
            <div className="wrap">
              <div className="sec-head">
                <h2>What customers say</h2>
                {rating && (
                  <p className="rating"><b>{rating.rating.toFixed(1)}</b><span><Stars n={rating.rating} /><small>{rating.count} review{rating.count === 1 ? "" : "s"} on Google</small></span></p>
                )}
              </div>
              {reviewList.length > 0 && (
                <div className={"review-list" + (reviewList.length % 2 === 0 && reviewList.length % 3 !== 0 ? " even" : "")}>
                  {reviewList.map((r, i) => (
                    <blockquote key={i} className="review">
                      <Stars n={r.rating} />
                      <p>{r.text.length > 260 ? r.text.slice(0, 257).trim() + "…" : r.text}</p>
                      <footer>{r.authorUri ? <a href={r.authorUri} rel="nofollow noopener" target="_blank">{r.author}</a> : r.author}{r.when && <span> · {r.when}</span>}</footer>
                    </blockquote>
                  ))}
                </div>
              )}
              <p className="reviews-foot">
                {reviewList.length > 0 && <span className="attrib">{liveReviews ? "Reviews from Google, updated daily" : "From our Google reviews"}</span>}
                {(reviews?.mapsUri || site.googleReviewsUrl) && (
                  <a className="btn btn-line" href={site.googleReviewsUrl || reviews.mapsUri} target="_blank" rel="noopener">Read all reviews on Google</a>
                )}
                {site.googlePlaceId && (
                  <a className="btn btn-text" href={`https://search.google.com/local/writereview?placeid=${encodeURIComponent(site.googlePlaceId)}`} target="_blank" rel="noopener">Leave us a review</a>
                )}
              </p>
            </div>
          </section>
        )}

        {/* about */}
        <section id="about" className="about">
          <div className={"wrap about-in" + (site.aboutPhoto ? " with-photo" : "")}>
            {site.aboutPhoto && <img className="about-photo" src={site.aboutPhoto} alt={`The team at ${site.shopName}`} loading="lazy" />}
            <div className="about-text">
              <h2>{site.aboutTitle || "About us"}</h2>
              {paras(site.about).map((t, i) => <p key={i}>{t}</p>)}
              {has(site.credentials) && <p className="creds">{site.credentials}</p>}
            </div>
          </div>
        </section>

        {/* gallery */}
        {photos.length > 0 && (
          <section className="gallery" aria-label="Photos">
            <div className="wrap">
              <h2>In the shop</h2>
              <div className="grid">
                {photos.map((p, i) => (
                  <figure key={i}>
                    <img src={p.url} alt={p.caption || `${site.shopName} photo ${i + 1}`} loading="lazy" />
                    {p.caption && <figcaption>{p.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* faq */}
        {faqs.length > 0 && (
          <section id="faq" className="faq">
            <div className="wrap faq-in">
              <h2>Good questions</h2>
              <div className="faq-list">
                {faqs.map((f, i) => (
                  <details key={i} open={i === 0}>
                    <summary>{f.q}<span aria-hidden="true" className="faq-sign" /></summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* visit */}
        <section id="visit" className="visit">
          <div className="wrap visit-in">
            <div className="visit-text">
              <h2>Come see us</h2>
              {addr ? <p className="where-addr">{addr}</p> : <p className="where-addr">Call for directions.</p>}
              <table className="hours">
                <tbody>
                  {site.hours.map((h, i) => (
                    <tr key={i} data-day={i} suppressHydrationWarning>
                      <th scope="row">{h.day}</th>
                      <td>{h.closed || !h.open || !h.close ? "Closed" : `${fmtTime(h.open)} – ${fmtTime(h.close)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {site.hoursNote && <p className="hours-note">{site.hoursNote}</p>}
              <div className="visit-cta">
                {tel && <a className="btn btn-call" href={`tel:${tel}`}><PhoneIcon />Call {fmtPhone(site.phone)}</a>}
                <a className="btn btn-light" href="/book"><CalIcon />Book online</a>
                {directions && <a className="btn btn-dim" href={directions} target="_blank" rel="noopener"><PinIcon />Directions</a>}
              </div>
            </div>
            {addr && (
              <div className="map">
                <iframe title={`Map to ${site.shopName}`} src={`https://maps.google.com/maps?q=${mapQ}&z=14&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
            )}
          </div>
          <div className="foot">
            <div className="wrap foot-in">
              <span>© {year} {site.shopName}</span>
              <a className="powered" href="https://www.xsitegroup.ca" target="_blank" rel="noopener">Powered by XSite Auto</a>
              {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
              {(fb || ig) && (
                <span className="social">
                  {fb && <a href={fb} target="_blank" rel="noopener" aria-label={`${site.shopName} on Facebook`}><FbIcon />Facebook</a>}
                  {ig && <a href={ig} target="_blank" rel="noopener" aria-label={`${site.shopName} on Instagram`}><IgIcon />Instagram</a>}
                </span>
              )}
            </div>
          </div>
        </section>
      </main>

      {tel && (
        <nav className="dock" aria-label="Contact">
          <a href={`tel:${tel}`}><PhoneIcon />Call</a>
          {sms && <a href={`sms:${sms}`}><TextIcon />Text</a>}
          <a href="/book"><CalIcon />Book</a>
          {directions && <a href={directions} target="_blank" rel="noopener"><PinIcon />Directions</a>}
        </nav>
      )}
    </>
  );
}

export function Stars({ n }) {
  const full = Math.round(n);
  return <span className="stars" role="img" aria-label={`${n} out of 5 stars`}>{"★★★★★".slice(0, full)}<span className="off">{"★★★★★".slice(full)}</span></span>;
}
function Icon({ name }) {
  const p = {
    wrench: <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.4-.6-.6-2.4z" />,
    doc: <><path d="M7 3.5h10v17H7z" /><path d="M10 8h4M10 12h4M10 16h2" /></>,
    chat: <path d="M4 5.5h16v10H9l-5 4z" />,
    pin: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
    star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />,
    manifold: <><path d="M3 8h4v8H3zM17 8h4v8h-4z" /><path d="M7 10c3 0 3 2 5 2s2-2 5-2M7 14c3 0 3-2 5-2s2 2 5 2" /></>,
    toyota: <><ellipse cx="12" cy="12" rx="9" ry="6" /><ellipse cx="12" cy="10.5" rx="5" ry="2.6" /><path d="M12 7.5v9" /></>,
    bolt: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />,
  }[name];
  return <svg className={"ico ico-" + name} viewBox="0 0 24 24" aria-hidden="true">{p}</svg>;
}
const PhoneIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.1 6.1l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" /></svg>);
const TextIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z" /></svg>);
const FbIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8.5V7c0-.8.6-1.2 1.3-1.2H17V3h-2.4C12.2 3 11 4.6 11 6.8v1.7H9v2.9h2V21h3v-9.6h2.4l.4-2.9z" /></svg>);
const IgIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><circle cx="12" cy="12" r="3.8" /><circle cx="17.2" cy="6.8" r="1" /></svg>);
const CalIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>);
const PinIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>);

// Shown beside the headline until a real photo is uploaded: a truck up on a two-post lift.
export function HeroArt({ town, name }) {
  const grid = [];
  for (let x = 20; x < 400; x += 40) grid.push(<line key={"x" + x} x1={x} y1="0" x2={x} y2="500" />);
  for (let y = 20; y < 500; y += 40) grid.push(<line key={"y" + y} x1="0" y1={y} x2="400" y2={y} />);
  return (
    <svg viewBox="0 0 400 500" role="img" aria-label="A pickup truck raised on a two-post lift in the shop">
      <rect width="400" height="500" fill="#16202a" />
      <g stroke="#1f2b37" strokeWidth="1">{grid}</g>
      <text x="28" y="48" fill="#e8961f" fontFamily="IBM Plex Mono, monospace" fontSize="13" fontWeight="600" letterSpacing="2">BAY 1</text>
      <text x="372" y="48" fill="#6b7a88" fontFamily="IBM Plex Mono, monospace" fontSize="12" textAnchor="end" letterSpacing="1">LIFT · 9,000 LB</text>
      {/* lift: overhead beam, posts, base plates */}
      <rect x="34" y="84" width="332" height="14" rx="3" fill="#2b3946" />
      <rect x="38" y="98" width="24" height="334" fill="#2b3946" />
      <rect x="338" y="98" width="24" height="334" fill="#2b3946" />
      <rect x="44" y="110" width="4" height="310" fill="#22303c" />
      <rect x="352" y="110" width="4" height="310" fill="#22303c" />
      <rect x="28" y="428" width="44" height="8" rx="2" fill="#3a4856" />
      <rect x="328" y="428" width="44" height="8" rx="2" fill="#3a4856" />
      {/* arms and pads */}
      <rect x="60" y="278" width="112" height="9" rx="2" fill="#e8961f" />
      <rect x="236" y="278" width="104" height="9" rx="2" fill="#e8961f" />
      <rect x="152" y="270" width="22" height="8" rx="2" fill="#f2b24d" />
      <rect x="236" y="270" width="22" height="8" rx="2" fill="#f2b24d" />
      {/* truck */}
      <path d="M70 270 L70 232 Q70 224 78 224 L168 224 L171 188 Q172 176 184 176 L238 176 Q246 176 252 184 L276 214 L320 220 Q330 222 332 232 L334 262 Q334 270 326 270 Z" fill="#c9d2db" />
      <path d="M184 186 L236 186 L262 214 L182 214 Z" fill="#16202a" opacity=".85" />
      <line x1="222" y1="186" x2="222" y2="214" stroke="#c9d2db" strokeWidth="5" />
      <line x1="70" y1="240" x2="168" y2="240" stroke="#a9b4bf" strokeWidth="2" />
      <rect x="312" y="232" width="18" height="8" rx="2" fill="#e8961f" />
      <rect x="72" y="232" width="8" height="10" rx="1" fill="#b4462f" />
      {[118, 288].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="272" r="30" fill="#16202a" />
          <circle cx={cx} cy="272" r="24" fill="#0b1117" stroke="#3a4856" strokeWidth="3" />
          <circle cx={cx} cy="272" r="10" fill="#6b7a88" />
          <circle cx={cx} cy="272" r="3" fill="#16202a" />
        </g>
      ))}
      {/* floor */}
      <line x1="0" y1="436" x2="400" y2="436" stroke="#3a4856" strokeWidth="2" />
      <ellipse cx="203" cy="436" rx="120" ry="5" fill="#0b1117" opacity=".6" />
      <text x="28" y="472" fill="#8a98a6" fontFamily="IBM Plex Mono, monospace" fontSize="12" letterSpacing="1.5">{`${String(name || "").toUpperCase()}${town ? " · " + String(town).toUpperCase() : ""}`}</text>
    </svg>
  );
}

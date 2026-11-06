import "../site/site.css";
import "./book.css";
import BookForm from "./BookForm";
import BookingFlow from "./BookingFlow";
import EmbedSize from "./EmbedSize";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getReviews, fmtPhone, telHref } from "@/lib/site";
import { loadPublic } from "@/lib/public";
import { takesBookings } from "@/lib/shop";
import { postalLabel } from "@/lib/locale";
import { fmtTime, fmtPrice, addressLine, has, Stars, HeroArt } from "../site/SiteView";

export const dynamic = "force-dynamic";

const load = async () => {
  const h = await headers();
  const p = await loadPublic(h);
  return p && { ...p, base: h.get("x-book-base") || "" };
};

export async function generateMetadata({ searchParams }) {
  const p = await load();
  if (!p) return { title: "Not found" };
  const s = p.site;
  const sp = await searchParams;
  const checkin = sp?.checkin !== undefined;
  return {
    title: `${checkin ? "Check in" : "Book a repair"} · ${s.shopName}`,
    description: checkin ? `Check in your vehicle at ${s.shopName}.` : `Pick an open drop-off time at ${s.shopName}${s.town ? ` in ${s.town}` : ""}.`,
    robots: s.published && !checkin ? undefined : { index: false },
  };
}

function TopBar({ site, base }) {
  const tel = telHref(site.phone);
  return (
    <header className="top">
      <div className="wrap top-in">
        {base ? <span className="mark">{site.shopName}</span> : <a className="mark" href="/">{site.shopName}</a>}
        {tel && <a className="top-phone show" href={`tel:${tel}`}>{fmtPhone(site.phone)}</a>}
      </div>
    </header>
  );
}

// data-color on embed.js: the shop's own main colour for buttons and highlights.
function accentStyle(c) {
  if (!/^#[0-9a-fA-F]{6}$/.test(c || "")) return undefined;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
  return { "--signal": c, "--signal-ink": dark ? "#ffffff" : "#111a23", "--signal-text": dark ? c : "#3d4954" };
}

// Online booking paused (trial ended): the shop's website still works, it just asks people to call.
function CallUs({ site, embed }) {
  const tel = telHref(site.phone);
  return (
    <main className={"book" + (embed ? " embed" : "")}>
      <div className="wrap book-in">
        <div className="book-head">
          <h1>Book with {site.shopName}</h1>
          <p className="lede">{tel ? <>Please call us to book: <a href={`tel:${tel}`}>{fmtPhone(site.phone)}</a></> : "Please call the shop to book."}</p>
        </div>
      </div>
      {embed && <EmbedSize />}
    </main>
  );
}

export default async function Book({ searchParams }) {
  const p = await load();
  if (!p) notFound();
  const { site, shop, base } = p;
  const sp = await searchParams;
  const checkin = sp?.checkin !== undefined;
  const embed = sp?.embed !== undefined;
  const tel = telHref(site.phone);
  const pl = postalLabel(shop.country);
  if (!takesBookings(shop)) return <>{!embed && <TopBar site={site} base={base} />}<CallUs site={site} embed={embed} /></>;

  // Inside a shop's own website: just the booking card, sized to fit the page around it.
  if (embed && !checkin) {
    const services = site.services.filter((s) => has(s.name));
    return (
      <main className="bp embed" style={accentStyle(sp?.color)}>
        <BookingFlow embed base={base} postalLabel={pl} services={services.map((s) => s.name)} shopName={site.shopName} phone={fmtPhone(site.phone)} tel={tel} />
        <p className="bk-by">Online booking by XSite Auto</p>
        <EmbedSize />
      </main>
    );
  }

  // Walk-in check-in at the counter keeps the plain form.
  if (checkin) {
    return (
      <>
        <TopBar site={site} base={base} />
        <main className="book">
          <div className="wrap book-in">
            <div className="book-head">
              <p className="eyebrow">At the shop</p>
              <h1>Check in your vehicle</h1>
              <p className="lede">Fill this in while we take a look. It saves us writing it all down, and we'll keep it on file for next time.</p>
            </div>
            <BookForm checkin base={base} postalLabel={pl} shopName={site.shopName} phone={fmtPhone(site.phone)} tel={tel} />
          </div>
        </main>
      </>
    );
  }

  const live = await getReviews(site.googlePlaceId);
  const reviews = live?.reviews?.length ? live.reviews
    : (site.featuredReviews || []).filter((r) => has(r.text)).slice(0, 3).map((r) => ({ rating: Number(r.stars) || 5, text: r.text.trim(), author: has(r.author) ? r.author : "Google review" }));
  const photos = [site.heroPhoto, ...site.photos.map((p) => p.url), site.aboutPhoto, ...(site.specialties || []).map((s) => s.photo)].filter(Boolean)
    .filter((u, i, a) => a.indexOf(u) === i).slice(0, 5);
  const services = site.services.filter((s) => has(s.name));
  const tags = [...(site.specialties || []).filter((s) => has(s.title)).map((s) => s.title)].slice(0, 4);
  const where = [site.town, site.province].filter(has).join(", ");
  const addr = addressLine(site);
  const mapUrl = addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${site.shopName}, ${addr}`)}` : "";

  return (
    <>
      <TopBar site={site} base={base} />
      <main className="bp">
        {photos.length > 0 ? (
          <div className={"bp-gallery n" + photos.length}>
            {photos.map((u, i) => <img key={u} src={u} alt={i === 0 ? `${site.shopName}` : ""} className={i === 0 ? "main" : ""} />)}
          </div>
        ) : (
          <div className="bp-band"><div className="wrap bp-band-in"><div className="bp-band-art"><HeroArt town={site.town} name={site.shopName} /></div></div></div>
        )}

        <div className="wrap">
          <div className="bp-head">
            <h1>{site.shopName}</h1>
            <p className="bp-meta">
              {live?.rating ? <><Stars n={live.rating} /> <b>{live.rating.toFixed(1)}</b> ({live.count} Google reviews)<span className="sep">·</span></> : null}
              Independent auto repair{where && <><span className="sep">·</span>{where}</>}
            </p>
            {tags.length > 0 && <ul className="bp-tags">{tags.map((t) => <li key={t}>{t}</li>)}</ul>}
          </div>
          <BookingFlow base={base} postalLabel={pl} services={services.map((s) => s.name)} shopName={site.shopName} phone={fmtPhone(site.phone)} tel={tel}>
            <div className="bp-info">

              <nav className="bp-tabs" aria-label="On this page">
                <a href="#overview">Overview</a>
                {services.length > 0 && <a href="#services">Services</a>}
                {reviews.length > 0 && <a href="#reviews">Reviews</a>}
                <a href="#hours">Hours &amp; location</a>
              </nav>

              <section id="overview" className="bp-sec">
                <h2>About {site.shopName}</h2>
                {has(site.intro) && <p>{site.intro}</p>}
                {has(site.credentials) && <p className="bp-cred">{site.credentials}</p>}
              </section>

              {services.length > 0 && (
                <section id="services" className="bp-sec">
                  <h2>Services &amp; prices</h2>
                  <ul className="bp-svc">
                    {services.map((s, i) => { const p = fmtPrice(s); return (
                      <li key={i}><div><b>{s.name}</b>{has(s.desc) && <span>{s.desc}</span>}</div>
                        <em className={p.quote ? "q" : ""}>{p.from && <small>from </small>}{p.text}</em></li>
                    ); })}
                  </ul>
                  {has(site.priceNote) && <p className="bp-small">{site.priceNote}</p>}
                </section>
              )}

              {reviews.length > 0 && (
                <section id="reviews" className="bp-sec">
                  <h2>What customers say</h2>
                  <div className="bp-reviews">
                    {reviews.slice(0, 3).map((r, i) => (
                      <blockquote key={i}><Stars n={r.rating} /><p>{r.text.length > 220 ? r.text.slice(0, 217).trim() + "…" : r.text}</p><footer>{r.author}</footer></blockquote>
                    ))}
                  </div>
                  {site.googleReviewsUrl && <a className="bp-more" href={site.googleReviewsUrl} target="_blank" rel="noopener">Read all reviews on Google</a>}
                </section>
              )}

              <section id="hours" className="bp-sec">
                <h2>Hours &amp; location</h2>
                <div className="bp-hl">
                  <table className="bp-hours"><tbody>
                    {site.hours.map((h) => (
                      <tr key={h.day}><th>{h.day}</th><td>{h.closed || !h.open ? "Closed" : `${fmtTime(h.open)} to ${fmtTime(h.close)}`}</td></tr>
                    ))}
                  </tbody></table>
                  <div>
                    {addr && <p><b>{site.shopName}</b><br />{addr}</p>}
                    {has(site.hoursNote) && <p className="bp-small">{site.hoursNote}</p>}
                    {mapUrl && <a className="bp-more" href={mapUrl} target="_blank" rel="noopener">Get directions</a>}
                  </div>
                </div>
              </section>
            </div>
          </BookingFlow>
        </div>
      </main>
    </>
  );
}

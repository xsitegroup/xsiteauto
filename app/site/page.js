import { headers } from "next/headers";
import { notFound } from "next/navigation";
import SiteView, { ComingSoon } from "./SiteView";
import { getReviews } from "@/lib/site";
import { loadPublic } from "@/lib/public";

// Each shop's own public website, found by the address it's served on. Built on each visit so a
// save in the Website tab shows straight away (Google reviews are still cached for a day).
export const dynamic = "force-dynamic";

const load = async () => loadPublic(await headers());

export async function generateMetadata() {
  const p = await load();
  if (!p) return { title: "Not found" };
  const s = p.site;
  const where = s.town ? ` in ${s.town}${s.province ? ", " + s.province : ""}` : "";
  return {
    title: s.published ? `${s.shopName} · Auto repair${where}` : s.shopName,
    description: s.intro,
    robots: s.published ? undefined : { index: false },
    openGraph: { title: s.shopName, description: s.intro, type: "website", images: s.photos?.[0]?.url ? [s.photos[0].url] : undefined },
  };
}

export default async function Page() {
  const p = await load();
  if (!p) notFound();
  if (!p.site.published) return <ComingSoon site={p.site} />;
  const reviews = await getReviews(p.site.googlePlaceId);
  return <SiteView site={p.site} reviews={reviews} />;
}

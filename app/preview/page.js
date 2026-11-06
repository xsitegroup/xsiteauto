import { redirect } from "next/navigation";
import SiteView from "../site/SiteView";
import { getSite, getReviews } from "@/lib/site";
import { currentUser } from "@/lib/auth";
import { sessionShop } from "@/lib/shop";
import { inShop } from "@/lib/db";

// Shop Book only (the public address redirects this away). Always shows the latest saved content.
export const dynamic = "force-dynamic";
export const metadata = { title: "Website preview", robots: { index: false } };

export default async function Preview() {
  const shop = await sessionShop(await currentUser());
  if (!shop) redirect("/login");
  const site = await inShop(shop.id, (q) => getSite(q, shop));
  const reviews = await getReviews(site.googlePlaceId);
  return <SiteView site={site} reviews={reviews} preview />;
}

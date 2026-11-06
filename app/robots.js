import { headers } from "next/headers";

// Each shop's own domain gets its own robots.txt and sitemap.
export default async function robots() {
  const host = ((await headers()).get("host") || "").split(":")[0];
  return { rules: [{ userAgent: "*", allow: "/" }], sitemap: host ? `https://${host}/sitemap.xml` : undefined };
}

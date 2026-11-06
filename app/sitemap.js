import { headers } from "next/headers";

export default async function sitemap() {
  const host = ((await headers()).get("host") || "").split(":")[0];
  return host ? [{ url: `https://${host}/`, changeFrequency: "monthly", priority: 1 }] : [];
}

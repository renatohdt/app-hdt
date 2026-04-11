import type { MetadataRoute } from "next";
import { INDEXABLE_ROUTES } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date();

  return INDEXABLE_ROUTES.map((route) => ({
    url: new URL(route.pathname, siteUrl).toString(),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority
  }));
}


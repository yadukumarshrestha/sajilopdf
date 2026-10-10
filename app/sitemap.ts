import type { MetadataRoute } from "next";
import { tools } from "@/lib/tools";
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sajilopdf.vercel.app").replace(/\/$/, "");
  const pages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/privacy`, changeFrequency: "monthly", priority: 0.3 },
  ];
  for (const tool of tools) pages.push({ url: `${baseUrl}/tools/${tool.slug}`, changeFrequency: "monthly", priority: tool.available ? 0.8 : 0.4 });
  return pages;
}

import type { MetadataRoute } from "next";

// 014 robots.txt; disallow admin-adjacent + account paths.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://kmodern.ir";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/account", "/orders", "/order/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
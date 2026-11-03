import type { MetadataRoute } from "next";
import { AI_CRAWLERS, AI_ROBOTS_TOKENS } from "@/lib/bots";

// Search engines may index the pages; AI crawlers may not read anything, and
// no crawler should walk the API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: [...AI_CRAWLERS, ...AI_ROBOTS_TOKENS], disallow: "/" },
      { userAgent: "*", allow: "/", disallow: ["/api/"] },
    ],
  };
}

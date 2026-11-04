import type { NextConfig } from "next";

// Next's hydration needs inline scripts, and Tailwind and the charts set
// inline styles; images come only from Roblox's image CDN. The dev server
// also needs eval, so the policy is production-only.
const csp = (frameAncestors: string) => [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://tr.rbxcdn.com",
  "font-src 'self'",
  "connect-src 'self'",
  `frame-ancestors ${frameAncestors}`,
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const shared = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-Robots-Tag", value: "noai, noimageai" },
];
const prod = process.env.NODE_ENV === "production";

// Every page refuses to be framed except the embeddable widgets, which exist
// to be shown on other sites.
const pageHeaders = [
  ...shared,
  { key: "X-Frame-Options", value: "DENY" },
  ...(prod ? [{ key: "Content-Security-Policy", value: csp("'none'") }] : []),
];
const embedHeaders = [...shared, ...(prod ? [{ key: "Content-Security-Policy", value: csp("*") }] : [])];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "tr.rbxcdn.com" }],
  },
  async headers() {
    return [
      { source: "/((?!embed/).*)", headers: pageHeaders },
      { source: "/embed/:path*", headers: embedHeaders },
    ];
  },
};

export default nextConfig;

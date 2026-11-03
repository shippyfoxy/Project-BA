import { NextResponse, type NextRequest } from "next/server";
import { isAiCrawler, isScraperLibrary } from "@/lib/bots";

// Requests per IP per minute. The API runs the heaviest database queries.
const LIMITS = { api: 30, page: 120 } as const;
const WINDOW_MS = 60_000;

// Per-instance counters: each server instance keeps its own, so this stops a
// single client hammering the site but is not a global quota. A Vercel
// Firewall rate-limit rule is the backstop for distributed traffic.
const hits = new Map<string, { count: number; reset: number }>();

function overLimit(key: string, limit: number, now: number): number | null {
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }
  const cur = hits.get(key);
  if (!cur || cur.reset <= now) {
    hits.set(key, { count: 1, reset: now + WINDOW_MS });
    return null;
  }
  cur.count++;
  return cur.count > limit ? Math.ceil((cur.reset - now) / 1000) : null;
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function middleware(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  const isApi = req.nextUrl.pathname.startsWith("/api/");

  if (isAiCrawler(ua)) {
    return new NextResponse("AI crawlers are not permitted on this site.\n", { status: 403, headers: { "Content-Type": "text/plain" } });
  }
  if (!isApi && isScraperLibrary(ua) && req.nextUrl.pathname !== "/robots.txt") {
    return new NextResponse("Automated access to pages is not permitted. See /api for the data.\n", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const kind = isApi ? "api" : "page";
  const retryAfter = overLimit(`${kind}:${clientIp(req)}`, LIMITS[kind], Date.now());
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${retryAfter} seconds.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  return NextResponse.next();
}

// Everything except Next's own static files and images.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon).*)"],
};

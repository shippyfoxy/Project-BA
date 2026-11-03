// Crawlers that collect pages to train or feed AI models. Listed in
// robots.txt and refused outright by the middleware, since robots.txt is
// only a request.
export const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "meta-externalfetcher",
  "FacebookBot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "omgili",
  "Timpibot",
  "YouBot",
  "AI2Bot",
  "Ai2Bot-Dolma",
  "PanguBot",
  "Kangaroo Bot",
  "Scrapy",
];

// robots.txt-only tokens: these opt a site out of AI use by crawlers that
// otherwise also index for search, so they are never blocked by user agent.
export const AI_ROBOTS_TOKENS = ["Google-Extended", "Applebot-Extended"];

// Generic HTTP libraries and scrapers. Refused on pages, which people read
// in a browser; the API is for programs and is rate limited instead.
export const SCRAPER_LIBRARIES = [
  "python-requests",
  "python-urllib",
  "aiohttp",
  "httpx",
  "Go-http-client",
  "okhttp",
  "Java/",
  "libwww-perl",
  "Wget",
  "HeadlessChrome",
  "PhantomJS",
  "Puppeteer",
  "Playwright",
  "colly",
  "node-fetch",
  "axios/",
];

const lower = (list: string[]) => list.map((s) => s.toLowerCase());
const AI = lower(AI_CRAWLERS);
const LIBS = lower(SCRAPER_LIBRARIES);

export function isAiCrawler(ua: string): boolean {
  const u = ua.toLowerCase();
  return AI.some((b) => u.includes(b));
}

export function isScraperLibrary(ua: string): boolean {
  const u = ua.toLowerCase();
  return u === "" || LIBS.some((b) => u.includes(b));
}

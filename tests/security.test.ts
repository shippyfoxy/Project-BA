import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/trends/history";
import { isAiCrawler, isScraperLibrary } from "@/lib/bots";

describe("CSV exports", () => {
  it("neutralises text a spreadsheet would run as a formula", () => {
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe(`"'=HYPERLINK(""http://x"",""click"")"`);
    expect(csvCell("+1 Spider Arm")).toBe("'+1 Spider Arm");
    expect(csvCell("@everyone")).toBe("'@everyone");
    expect(csvCell("-Bloodlines-")).toBe("'-Bloodlines-");
  });

  it("leaves numbers and ordinary text alone", () => {
    expect(csvCell(-12.8)).toBe("-12.8");
    expect(csvCell(13_260_000)).toBe("13260000");
    expect(csvCell("Steal An Egg")).toBe("Steal An Egg");
    expect(csvCell(null)).toBe("");
    expect(toCsv([{ name: "=1+1", wow: -5 }], ["name", "wow"])).toBe("name,wow\n'=1+1,-5\n");
  });
});

describe("bot detection", () => {
  it("spots AI crawlers by user agent", () => {
    expect(isAiCrawler("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)")).toBe(true);
    expect(isAiCrawler("Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)")).toBe(true);
    expect(isAiCrawler("CCBot/2.0 (https://commoncrawl.org/faq/)")).toBe(true);
    expect(isAiCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(false);
    expect(isAiCrawler("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36")).toBe(false);
  });

  it("spots scraping libraries but not browsers", () => {
    expect(isScraperLibrary("python-requests/2.32.3")).toBe(true);
    expect(isScraperLibrary("Mozilla/5.0 HeadlessChrome/141.0")).toBe(true);
    expect(isScraperLibrary("")).toBe(true);
    expect(isScraperLibrary("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1")).toBe(false);
  });
});

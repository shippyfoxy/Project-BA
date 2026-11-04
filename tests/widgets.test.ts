import { describe, expect, it } from "vitest";
import { renderRss } from "@/lib/feeds";
import { escapeXml, parseWidgetId, type WidgetGame } from "@/lib/trends/widget";
import { badgeValue, renderBadge, renderCard } from "@/lib/widgets";

const game: WidgetGame = {
  universeId: 42,
  name: '[🎃] Bad <script>"Game"</script>',
  genre: "Action",
  cur7: 12_345,
  prev7: 10_000,
  wowPct: 23.45,
  now: 15_000,
  nowMs: 0,
  stage: "rising",
  days: [
    [0, 10_000],
    [86_400_000, 12_000],
  ],
};

describe("widgets and feeds", () => {
  it("reads ids with or without .svg", () => {
    expect(parseWidgetId("6035872082.svg")).toBe(6035872082);
    expect(parseWidgetId("6035872082")).toBe(6035872082);
    expect(parseWidgetId("abc")).toBeNull();
    expect(parseWidgetId("0")).toBeNull();
  });

  it("escapes names chosen by anyone", () => {
    expect(escapeXml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    const card = renderCard(game, "auto", null);
    expect(card).not.toContain("<script>");
    expect(card).toContain("12,345");
    expect(renderBadge("<b>", { text: "1k players", color: "#000" })).not.toContain("<b>");
    const rss = renderRss({ title: "T", path: "/feeds/x.xml", description: "D" }, [
      { guid: "g", title: "<x>", link: "https://pulse.shipfox.me/games/1", description: "a & b", dateMs: 0 },
    ]);
    expect(rss).toContain("&lt;x&gt;");
    expect(rss).toContain("a &amp; b");
  });

  it("gives each badge metric its own value", () => {
    expect(badgeValue(game, "players").text).toBe("12.3k players");
    expect(badgeValue(game, "now").text).toBe("15k playing");
    expect(badgeValue(game, "trend").text).toBe("+23% this week");
    expect(badgeValue(null, "players").text).toBe("not tracked");
  });
});

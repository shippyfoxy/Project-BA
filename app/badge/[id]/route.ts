import { getCachedWidgetGame } from "@/lib/trends/cached";
import { parseWidgetId } from "@/lib/trends/widget";
import { BADGE_METRICS, badgeValue, renderBadge, type BadgeMetric } from "@/lib/widgets";

// A badge image for READMEs and forum posts: /badge/<universe id>.svg.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseWidgetId((await params).id);
  const q = new URL(req.url).searchParams;
  const m = q.get("metric");
  const metric: BadgeMetric = BADGE_METRICS.includes(m as BadgeMetric) ? (m as BadgeMetric) : "players";
  // Short labels only: the badge is an image, not a place for text.
  const label = (q.get("label") ?? "Roblox").slice(0, 24) || "Roblox";
  const game = id ? await getCachedWidgetGame(id).catch(() => null) : null;
  return new Response(renderBadge(label, badgeValue(game, metric)), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}

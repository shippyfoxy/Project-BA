import { getCachedWidgetGame } from "@/lib/trends/cached";
import { parseWidgetId } from "@/lib/trends/widget";
import { getGameIcons } from "@/lib/roblox/thumbnails";
import { renderCard, type CardTheme } from "@/lib/widgets";

// A small card for other sites to show in an iframe. Plain HTML with no
// scripts, so it loads fast and carries none of the site around it.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseWidgetId((await params).id);
  if (!id) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain" } });
  const t = new URL(req.url).searchParams.get("theme");
  const theme: CardTheme = t === "light" || t === "dark" ? t : "auto";
  const [game, icons] = await Promise.all([getCachedWidgetGame(id).catch(() => null), getGameIcons([id]).catch(() => new Map<number, string>())]);
  return new Response(renderCard(game, theme, icons.get(id) ?? null), {
    status: game ? 200 : 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}

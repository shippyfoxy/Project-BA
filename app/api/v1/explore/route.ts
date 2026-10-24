import { NextResponse, type NextRequest } from "next/server";
import { getSiteDb } from "@/lib/db/site";
import { ageDays, parseFilters, screenGames } from "@/lib/trends/screener";

const METHODOLOGY = "https://pulse.shipfox.me/methodology";

const csvCell = (v: string | number | null) => {
  if (v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const round = (n: number | null, digits = 0) => (n === null ? null : Number(n.toFixed(digits)));

// Every game matching the Explore filters, with the same query parameters as
// the page. Not paged: the full match list is a few thousand rows at most.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const format = sp.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return NextResponse.json({ error: "format must be json or csv." }, { status: 400 });

  const params: Record<string, string[]> = {};
  for (const [k, v] of sp) (params[k] ??= []).push(v);
  const f = parseFilters(params);

  const db = getSiteDb();
  const result = db ? await screenGames(db, f) : null;
  if (!result) return NextResponse.json({ error: "The database is not available." }, { status: 503 });

  const games = result.matches.map((g) => ({
    universe_id: g.universeId,
    name: g.name,
    creator: g.creatorName,
    genre: g.genre,
    stage: g.stage,
    created: g.createdMs === null ? null : new Date(g.createdMs).toISOString().slice(0, 10),
    age_days: ageDays(g.createdMs, result.asOfMs),
    players_7d_avg: round(g.cur7),
    players_prev_7d_avg: round(g.prev7),
    week_on_week_pct: round(g.wowPct, 1),
    peak_7d_avg: round(g.peak7),
    est_session_min: round(g.session, 1),
    favourites_per_1k_visits: round(g.favsPer1k, 2),
  }));

  const headers = { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" };
  if (format === "csv") {
    const cols = Object.keys(games[0] ?? { universe_id: 0 }) as (keyof (typeof games)[number])[];
    const body = [cols.join(","), ...games.map((g) => cols.map((c) => csvCell(g[c])).join(","))].join("\n");
    return new NextResponse(`${body}\n`, {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="roblox-pulse-explore-${result.day}.csv"`,
      },
    });
  }
  return NextResponse.json(
    { as_of: new Date(result.asOfMs).toISOString(), week_to: result.day, methodology: METHODOLOGY, count: games.length, games },
    { headers },
  );
}

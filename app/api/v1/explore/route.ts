import { NextResponse, type NextRequest } from "next/server";
import { getSiteDb } from "@/lib/db/site";
import { requirePro } from "@/lib/pro";
import { ageDays, parseFilters, screenGames, windowAverages } from "@/lib/trends/screener";
import { estMonthlyDevEx } from "@/lib/trends/revenue";
import { displayName } from "@/lib/trends/names";
import { csvCell } from "@/lib/trends/history";

const METHODOLOGY = "https://pulse.shipfox.me/methodology";

const round = (n: number | null, digits = 0) => (n === null ? null : Number(n.toFixed(digits)));

// Every game matching the Explore filters, with the same query parameters as
// the page. Not paged: the full match list is a few thousand rows at most.
export async function GET(req: NextRequest) {
  const denied = await requirePro(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const format = sp.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return NextResponse.json({ error: "format must be json or csv." }, { status: 400 });

  const params: Record<string, string[]> = {};
  for (const [k, v] of sp) (params[k] ??= []).push(v);
  const f = parseFilters(params);

  const db = getSiteDb();
  const result = db ? await screenGames(db, f) : null;
  if (!result) return NextResponse.json({ error: "The database is not available." }, { status: 503 });

  const [windows, [list]] = await Promise.all([
    windowAverages(db!, result.day, result.matches.map((g) => g.universeId)),
    db!.query<{ day: string | null }>(`select max(day)::text as day from earning_ranks`),
  ]);
  const thousands = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v / 1_000) * 1_000);

  const games = result.matches.map((g) => {
    const w = windows.get(g.universeId);
    const est = estMonthlyDevEx(g.earningRank);
    return {
    universe_id: g.universeId,
    // The same cleaned name the site shows; roblox_name keeps the raw title.
    name: displayName(g.name),
    roblox_name: g.name,
    creator: g.creatorName,
    genre: g.genre,
    stage: g.stage,
    created: g.createdMs === null ? null : new Date(g.createdMs).toISOString().slice(0, 10),
    age_days: ageDays(g.createdMs, result.asOfMs),
    players_1d_avg: round(w?.d1 ?? null),
    players_7d_avg: round(g.cur7),
    players_prev_7d_avg: round(g.prev7),
    players_30d_avg: round(w?.d30 ?? null),
    players_90d_avg: round(w?.d90 ?? null),
    week_on_week_pct: round(g.wowPct, 1),
    peak_7d_avg: round(g.peak7),
    est_session_min: round(g.session, 1),
    favourites_per_1k_visits: round(g.favsPer1k, 2),
    top_earning_rank: g.earningRank,
    top_earning_day: g.earningRank === null ? null : list?.day ?? null,
    // MODELLED from the rank, the same figures the site shows: see /methodology#revenue.
    est_monthly_devex_usd: thousands(est?.mid),
    est_monthly_devex_low_usd: thousands(est?.low),
    est_monthly_devex_high_usd: thousands(est?.high),
    };
  });

  const headers = { "Cache-Control": "private, max-age=1800" };
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
    { as_of: new Date(result.asOfMs).toISOString(), week_to: result.day, revenue_estimated: true, methodology: METHODOLOGY, count: games.length, games },
    { headers },
  );
}

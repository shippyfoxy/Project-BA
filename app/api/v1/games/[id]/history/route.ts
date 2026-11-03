import { NextResponse, type NextRequest } from "next/server";
import { getSiteDb } from "@/lib/db/site";
import { displayName } from "@/lib/trends/names";
import { RESOLUTIONS, rollUp, toCsv, toDaily, type DayRow, type Resolution } from "@/lib/trends/history";


const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// Matches the format and is a real calendar day (2026-02-30 is not).
const realDay = (s: string) => DAY_RE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const METHODOLOGY = "https://pulse.shipfox.me/methodology";
// Data changes a few times a day; the API page promises at most 30 minutes stale.
const CACHE = { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" };


function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,20}$/.test(id)) return bad("Universe ID must be a number.");
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const format = sp.get("format") ?? "json";
  const resolution = (sp.get("resolution") ?? "daily") as Resolution;
  if (!(RESOLUTIONS as readonly string[]).includes(resolution)) return bad("resolution must be daily, weekly or monthly.");
  if ((from && !realDay(from)) || (to && !realDay(to))) return bad("Dates must be real days as YYYY-MM-DD.");
  if (format !== "json" && format !== "csv") return bad("format must be json or csv.");

  const db = getSiteDb();
  if (!db) return bad("The database is not available.", 503);

  const [game] = await db.query<{ universe_id: number; name: string; genre: string }>(
    `select universe_id::float8 as universe_id, name, coalesce(genre_l1, 'Other') as genre from games where universe_id = $1::bigint`,
    [id],
  );
  if (!game) return bad("No tracked game with that universe ID.", 404);

  // Defaults to the last 30 days (daily), 26 weeks (weekly) or all history (monthly).
  const span = resolution === "daily" ? 29 : resolution === "weekly" ? 181 : 100_000;
  const rows = await db.query<DayRow>(
    `with bounds as (
       select coalesce($2::date, max(day)) as to_day from game_daily where universe_id = $1::bigint
     )
     select d.day::text as day, round(d.playing_avg)::float8 as playing_avg, d.playing_min, d.playing_max,
            to_char(d.playing_max_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as playing_max_at,
            d.visits_last::float8 as visits, d.favorites_last as favorites,
            d.up_votes_last as up_votes, d.down_votes_last as down_votes, d.samples::int as samples,
            e.rank as top_earning_rank,
            d.day >= coalesce($3::date, bounds.to_day - $4::int) as in_range
     from game_daily d
     cross join bounds
     left join earning_ranks e on e.universe_id = d.universe_id and e.day = d.day
     where d.universe_id = $1::bigint
       and d.day <= bounds.to_day
       and d.day >= coalesce($3::date, bounds.to_day - $4::int) - 1
     order by d.day`,
    [id, to, from, span],
  );
  const data = resolution === "daily" ? toDaily(rows) : rollUp(rows, resolution);

  if (format === "csv") {
    const cols = (data.length ? Object.keys(data[0]) : ["day"]) as (keyof (typeof data)[number])[];
    return new NextResponse(toCsv(data as object[], cols as never), {
      headers: {
        ...CACHE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="roblox-pulse-${id}-${resolution}.csv"`,
      },
    });
  }

  return NextResponse.json(
    {
      game: { universe_id: game.universe_id, name: displayName(game.name), roblox_name: game.name, genre: game.genre },
      resolution,
      estimated: true,
      methodology: METHODOLOGY,
      data,
    },
    { headers: CACHE },
  );
}

import { NextResponse, type NextRequest } from "next/server";
import { getSiteDb } from "@/lib/db/site";
import { requirePro } from "@/lib/pro";
import { displayName } from "@/lib/trends/names";
import { estMonthlyDevEx } from "@/lib/trends/revenue";
import { toCsv } from "@/lib/trends/history";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// Matches the format and is a real calendar day (2026-02-30 is not).
const realDay = (s: string) => DAY_RE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const METHODOLOGY = "https://pulse.shipfox.me/methodology";
const CACHE = { "Cache-Control": "private, max-age=1800" };

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Every tracked game for one UTC day: the bulk export. Defaults to the last
// complete day, since today is still filling in. A day is about 7,000 rows.
export async function GET(req: NextRequest) {
  const denied = await requirePro(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const day = sp.get("day");
  const format = sp.get("format") ?? "json";
  const min = Number(sp.get("min") ?? 0);
  if (day && !realDay(day)) return bad("day must be a real day as YYYY-MM-DD.");
  if (format !== "json" && format !== "csv") return bad("format must be json or csv.");
  if (!Number.isFinite(min) || min < 0) return bad("min must be a number of players.");

  const db = getSiteDb();
  if (!db) return bad("The database is not available.", 503);

  const rows = await db.query<{
    day: string;
    universe_id: number;
    name: string;
    creator_name: string | null;
    genre: string;
    playing_avg: number;
    playing_min: number;
    playing_max: number;
    visits: number;
    prev_visits: number | null;
    gap_mins: number | null;
    favorites: number | null;
    up_votes: number | null;
    down_votes: number | null;
    samples: number;
    rank: number | null;
  }>(
    `with target as (select coalesce($1::date, (select max(day) - 1 from game_daily)) as day)
     select d.day::text as day, d.universe_id::float8 as universe_id, g.name, g.creator_name,
            coalesce(g.genre_l1, 'Other') as genre, round(d.playing_avg)::float8 as playing_avg,
            d.playing_min, d.playing_max, d.visits_last::float8 as visits, p.visits_last::float8 as prev_visits,
            extract(epoch from d.last_ts - p.last_ts)::float8 / 60 as gap_mins,
            d.favorites_last as favorites, d.up_votes_last as up_votes, d.down_votes_last as down_votes,
            d.samples::int as samples, e.rank
     from target
     join game_daily d on d.day = target.day
     join games g using (universe_id)
     left join game_daily p on p.universe_id = d.universe_id and p.day = target.day - 1
     left join earning_ranks e on e.universe_id = d.universe_id and e.day = target.day
     where d.playing_avg >= $2
     order by d.playing_avg desc`,
    [day, min],
  );

  const data = rows.map((r) => {
    const est = estMonthlyDevEx(r.rank);
    return {
      day: r.day,
      universe_id: r.universe_id,
      name: displayName(r.name),
      roblox_name: r.name,
      creator: r.creator_name ?? "Unknown",
      genre: r.genre,
      playing_avg: r.playing_avg,
      playing_min: r.playing_min,
      playing_max: r.playing_max,
      visits: r.visits,
      // Scaled to 24 hours: the two last readings can be 12 to 36 hours apart.
      new_visits:
        r.prev_visits === null || r.gap_mins === null || r.gap_mins < 360
          ? null
          : Math.round((Math.max(r.visits - r.prev_visits, 0) * 1_440) / r.gap_mins),
      favorites: r.favorites,
      up_votes: r.up_votes,
      down_votes: r.down_votes,
      samples: r.samples,
      top_earning_rank: r.rank,
      // MODELLED from the rank: see /methodology#revenue.
      est_monthly_devex_usd: est ? Math.round(est.mid / 1_000) * 1_000 : null,
    };
  });
  const outDay = data[0]?.day ?? day ?? "none";

  if (format === "csv") {
    const cols = (data.length ? Object.keys(data[0]) : ["day"]) as (keyof (typeof data)[number])[];
    return new NextResponse(toCsv(data, cols), {
      headers: {
        ...CACHE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="roblox-pulse-daily-${outDay}.csv"`,
      },
    });
  }
  return NextResponse.json({ day: outDay, estimated: true, methodology: METHODOLOGY, count: data.length, games: data }, { headers: CACHE });
}

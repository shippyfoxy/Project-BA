import { NextResponse, type NextRequest } from "next/server";
import { getSiteDb } from "@/lib/db/site";

export const revalidate = 1800;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const METHODOLOGY = "https://pulse.shipfox.me/methodology";

interface Row {
  day: string;
  playing_avg: number;
  playing_min: number;
  playing_max: number;
  playing_max_at: string;
  visits: number;
  favorites: number | null;
  up_votes: number | null;
  down_votes: number | null;
  samples: number;
}

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
  if ((from && !DAY_RE.test(from)) || (to && !DAY_RE.test(to))) return bad("Dates must be YYYY-MM-DD.");
  if (format !== "json" && format !== "csv") return bad("format must be json or csv.");

  const db = getSiteDb();
  if (!db) return bad("The database is not available.", 503);

  const [game] = await db.query<{ universe_id: number; name: string; genre: string | null }>(
    `select universe_id::float8 as universe_id, name, genre_l1 as genre from games where universe_id = $1::bigint`,
    [id],
  );
  if (!game) return bad("No tracked game with that universe ID.", 404);

  // Defaults to the last 30 days of the game's own history.
  const rows = await db.query<Row>(
    `with bounds as (
       select coalesce($2::date, max(day)) as to_day from game_daily where universe_id = $1::bigint
     )
     select d.day::text as day, round(d.playing_avg)::float8 as playing_avg, d.playing_min, d.playing_max,
            to_char(d.playing_max_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as playing_max_at,
            d.visits_last::float8 as visits, d.favorites_last as favorites,
            d.up_votes_last as up_votes, d.down_votes_last as down_votes, d.samples::int as samples
     from game_daily d, bounds
     where d.universe_id = $1::bigint
       and d.day <= bounds.to_day
       and d.day >= coalesce($3::date, bounds.to_day - 29)
     order by d.day`,
    [id, to, from],
  );

  if (format === "csv") {
    const header = "day,playing_avg,playing_min,playing_max,playing_max_at,visits,favorites,up_votes,down_votes,samples";
    const lines = rows.map((r) =>
      [r.day, r.playing_avg, r.playing_min, r.playing_max, r.playing_max_at, r.visits, r.favorites ?? "", r.up_votes ?? "", r.down_votes ?? "", r.samples].join(","),
    );
    return new NextResponse([header, ...lines].join("\n") + "\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="roblox-pulse-${id}-history.csv"`,
      },
    });
  }

  return NextResponse.json({
    game: { universe_id: game.universe_id, name: game.name, genre: game.genre },
    resolution: "daily",
    estimated: true,
    methodology: METHODOLOGY,
    data: rows,
  });
}

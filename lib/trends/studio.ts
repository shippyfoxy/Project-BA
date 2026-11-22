import type { Db } from "@/lib/db/client";
import { estMonthlyDevEx, type RevenueEstimate } from "./revenue";
import type { RankedGame } from "./revenuePage";

const DAY_MS = 86_400_000;
const MIN_PEERS = 10;

// What games like this one earn per concurrent player, from the games in the
// Top Earning list with 1,000+ players: its subgenre if 10 or more qualify,
// else its genre, else every listed game. Listed games are the top earners,
// so this reads high for a game outside the list.
export interface PerPlayer {
  basis: string; // the group the figures come from
  n: number;
  p25: number;
  p50: number;
  p75: number;
}

const quantile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};

export function perPlayerRange(listed: RankedGame[], subgenre: string | null, genre: string): PerPlayer {
  const ok = listed.filter((g) => g.cur7 !== null && g.cur7 >= 1_000);
  const groups: [string, RankedGame[]][] = [
    [subgenre ?? "", subgenre ? ok.filter((g) => g.subgenre === subgenre) : []],
    [genre, ok.filter((g) => g.genre === genre)],
    ["every listed game", ok],
  ];
  const [basis, games] = groups.find(([, gs]) => gs.length >= MIN_PEERS) ?? groups[2];
  const per = games.map((g) => g.estMonthly / g.cur7!);
  return { basis, n: per.length, p25: quantile(per, 0.25), p50: quantile(per, 0.5), p75: quantile(per, 0.75) };
}

export interface MonthRow {
  month: string; // YYYY-MM
  days: number; // days with readings
  avg: number; // average players over those days
  peak: number;
  rankedDays: number; // days in the Top Earning list
  est: RevenueEstimate; // MODELLED monthly payout
  source: "rank" | "players" | "capped"; // capped: off the list, so below its lowest rank
}

export interface TrackedGame {
  universeId: number;
  name: string;
  genre: string;
  subgenre: string | null;
  createdMs: number | null;
  firstSeenMs: number;
  peak: number;
  peakDayMs: number;
  cur7: number | null;
  months: MonthRow[];
  perPlayer: PerPlayer;
  total: RevenueEstimate; // MODELLED, over the months shown
}

export interface Studio {
  kind: "group" | "user";
  id: number;
  name: string | null;
  tracked: TrackedGame[];
  series: { universeId: number; name: string; points: [number, number][] }[];
  earningFrom: string | null; // when Top Earning recording began
}

// Days of `month` (YYYY-MM) between `fromMs` and `toMs`, for a partial first or current month.
function daysCovered(month: string, fromMs: number, toMs: number): { covered: number; inMonth: number } {
  const start = Date.parse(`${month}-01`);
  const d = new Date(start);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const covered = Math.max(0, Math.min(end, toMs) - Math.max(start, fromMs)) / DAY_MS;
  return { covered, inMonth: (end - start) / DAY_MS };
}

export async function getStudio(db: Db, kind: "group" | "user", id: number, listed: RankedGame[]): Promise<Studio> {
  const type = kind === "group" ? "Group" : "User";
  const games = await db.query<{
    universe_id: number;
    name: string;
    creator_name: string | null;
    genre: string;
    subgenre: string | null;
    created_ms: number | null;
    first_ms: number;
  }>(
    `select universe_id::float8 as universe_id, name, creator_name, coalesce(nullif(genre_l1, 'All'), 'Other') as genre,
            nullif(genre_l2, '') as subgenre, extract(epoch from created_at)::float8 * 1000 as created_ms,
            extract(epoch from first_seen)::float8 * 1000 as first_ms
     from games where creator_type = $1 and creator_id = $2::bigint`,
    [type, id],
  );
  const [earn] = await db.query<{ first: string | null; last: string | null; below: number | null }>(
    `select min(day)::text as first, max(day)::text as last,
            (select max(rank) + 1 from earning_ranks where day = (select max(day) from earning_ranks)) as below
     from earning_ranks`,
  );
  if (!games.length) return { kind, id, name: null, tracked: [], series: [], earningFrom: earn?.first ?? null };

  const ids = games.map((g) => g.universe_id);
  const [months, ranks, daily, cur] = await Promise.all([
    db.query<{ universe_id: number; m: string; days: number; avg: number; peak: number }>(
      `select universe_id::float8 as universe_id, to_char(day, 'YYYY-MM') as m, count(*)::int as days,
              avg(playing_avg)::float8 as avg, max(playing_max)::int as peak
       from game_daily where universe_id = any($1::bigint[]) group by 1, 2 order by 1, 2`,
      [ids],
    ),
    db.query<{ universe_id: number; m: string; ranks: number[] }>(
      `select universe_id::float8 as universe_id, to_char(day, 'YYYY-MM') as m, array_agg(rank)::int[] as ranks
       from earning_ranks where universe_id = any($1::bigint[]) group by 1, 2`,
      [ids],
    ),
    db.query<{ universe_id: number; day_ms: number; players: number; max: number }>(
      `select universe_id::float8 as universe_id, extract(epoch from day)::float8 * 1000 as day_ms,
              playing_avg::float8 as players, playing_max::float8 as max
       from game_daily where universe_id = any($1::bigint[]) order by day`,
      [ids],
    ),
    db.query<{ universe_id: number; cur7: number | null }>(
      `select universe_id::float8 as universe_id, avg(playing_avg)::float8 as cur7 from game_daily
       where universe_id = any($1::bigint[]) and day > (select max(day) from game_daily) - 8 and day < (select max(day) from game_daily)
       group by 1`,
      [ids],
    ),
  ]);

  const nowMs = Date.now();
  const earnMonth = earn?.first?.slice(0, 7) ?? null;
  const cap = earn?.below ? estMonthlyDevEx(earn.below)!.mid : null;
  const tracked: TrackedGame[] = games.map((g) => {
    const perPlayer = perPlayerRange(listed, g.subgenre, g.genre);
    const rows = months.filter((m) => m.universe_id === g.universe_id);
    const days = daily.filter((d) => d.universe_id === g.universe_id);
    const peakDay = days.reduce((a, d) => (d.max > a.max ? d : a), days[0] ?? { day_ms: g.first_ms, max: 0 });
    const monthRows: MonthRow[] = rows.map((r) => {
      const ranked = ranks.find((x) => x.universe_id === g.universe_id && x.m === r.m)?.ranks ?? [];
      let est: RevenueEstimate;
      let source: MonthRow["source"];
      if (ranked.length) {
        // Listed that month: the rank-based estimate, averaged over its listed days.
        const ests = ranked.map((rank) => estMonthlyDevEx(rank)!);
        const mean = (k: keyof RevenueEstimate) => ests.reduce((a, e) => a + e[k], 0) / ests.length;
        est = { low: mean("low"), mid: mean("mid"), high: mean("high") };
        source = "rank";
      } else {
        est = { low: r.avg * perPlayer.p25, mid: r.avg * perPlayer.p50, high: r.avg * perPlayer.p75 };
        source = "players";
        // Off the list while it was being recorded: it earned less than the lowest-ranked game.
        if (earnMonth && cap && r.m >= earnMonth && est.mid > cap) {
          est = { low: Math.min(est.low, cap), mid: Math.min(est.mid, cap), high: cap };
          source = "capped";
        }
      }
      return { month: r.m, days: r.days, avg: r.avg, peak: r.peak, rankedDays: ranked.length, est, source };
    });
    // Each month counts in proportion to the part of it tracked so far: from the first reading, up to today.
    const total = monthRows.reduce(
      (t, m) => {
        const { covered, inMonth } = daysCovered(m.month, g.first_ms, nowMs);
        const f = covered / inMonth;
        return { low: t.low + m.est.low * f, mid: t.mid + m.est.mid * f, high: t.high + m.est.high * f };
      },
      { low: 0, mid: 0, high: 0 },
    );
    return {
      universeId: g.universe_id,
      name: g.name,
      genre: g.genre,
      subgenre: g.subgenre,
      createdMs: g.created_ms,
      firstSeenMs: g.first_ms,
      peak: peakDay.max,
      peakDayMs: peakDay.day_ms,
      cur7: cur.find((c) => c.universe_id === g.universe_id)?.cur7 ?? null,
      months: monthRows,
      perPlayer,
      total,
    };
  });
  tracked.sort((a, b) => b.peak - a.peak);
  const charted = tracked.slice(0, 6);
  return {
    kind,
    id,
    name: games[0].creator_name,
    tracked,
    series: charted.map((t) => ({
      universeId: t.universeId,
      name: t.name,
      points: daily.filter((d) => d.universe_id === t.universeId).map((d) => [d.day_ms, d.players] as [number, number]),
    })),
    earningFrom: earn?.first ?? null,
  };
}

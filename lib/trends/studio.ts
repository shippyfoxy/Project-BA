import type { Db } from "@/lib/db/client";
import { estMonthlyDevEx, type RevenueEstimate } from "./revenue";
import type { RankedGame } from "./revenuePage";
import { fmtCompact } from "@/lib/format";

const DAY_MS = 86_400_000;
const MIN_PEERS = 10;

// What games like this one earn per concurrent player, from the games in the
// Top Earning list with 1,000+ players: its subgenre if 10 or more qualify,
// else its genre, else every listed game. Listed games are the top earners,
// so this can read high for a game outside the list (though it read low for Bloxburg; see /methodology#revenue-checks).
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
  // own: from players at the game's own revenue per player on its Top Earning days; players: at listed peers' rate;
  // capped: off the list, so below its lowest rank
  source: "rank" | "own" | "players" | "capped";
}

// Lifetime visits are public, so the months we track give revenue per visit, applied to every visit
// since launch. It assumes a visit before tracking earned what one earns now, which ignores past
// changes in spending, prices and the DevEx rate: the smaller the tracked share, the rougher it is.
export interface Lifetime {
  est: RevenueEstimate; // MODELLED
  trackedShare: number; // of lifetime visits, 0 to 1
  visits: number; // lifetime visits at the latest reading
}

export function lifetimeEstimate(total: RevenueEstimate, visitsAtStart: number | null, visitsNow: number | null): Lifetime | null {
  if (!visitsAtStart || !visitsNow || visitsNow <= visitsAtStart || total.mid <= 0) return null;
  const share = (visitsNow - visitsAtStart) / visitsNow;
  return { est: { low: total.low / share, mid: total.mid / share, high: total.high / share }, trackedShare: share, visits: visitsNow };
}

export const lifetimeNote = (l: Lifetime) =>
  `${l.trackedShare >= 0.995 ? "all" : `${Math.max(1, Math.round(l.trackedShare * 100))}%`} of its ${fmtCompact(l.visits, 1)} visits tracked${l.trackedShare < 0.25 ? ": mostly extrapolated" : ""}`;

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
  perPlayer: PerPlayer; // listed peers' rate, used when the game was never listed
  ownPerPlayer: RevenueEstimate | null; // its own monthly payout per average player, from its ranked months
  total: RevenueEstimate; // MODELLED, over the months shown
  lifetime: Lifetime | null;
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

type GameRow = {
  universe_id: number;
  name: string;
  creator_name: string | null;
  genre: string;
  subgenre: string | null;
  created_ms: number | null;
  first_ms: number;
};
const GAME_COLS = `universe_id::float8 as universe_id, name, creator_name, coalesce(nullif(genre_l1, 'All'), 'Other') as genre,
            nullif(genre_l2, '') as subgenre, extract(epoch from created_at)::float8 * 1000 as created_ms,
            extract(epoch from first_seen)::float8 * 1000 as first_ms`;

// `only` limits it to one of the studio's games, for a game page.
export async function getStudio(db: Db, kind: "group" | "user", id: number, listed: RankedGame[], only: number | null = null): Promise<Studio> {
  const type = kind === "group" ? "Group" : "User";
  const games = await db.query<GameRow>(
    `select ${GAME_COLS} from games where creator_type = $1 and creator_id = $2::bigint and ($3::bigint is null or universe_id = $3::bigint)`,
    [type, id, only],
  );
  const { tracked, daily, earningFrom } = await track(db, games, listed);
  const charted = tracked.slice(0, 6);
  return {
    kind,
    id,
    name: games[0]?.creator_name ?? null,
    tracked,
    series: charted.map((t) => ({
      universeId: t.universeId,
      name: t.name,
      points: (daily.get(t.universeId) ?? []).map((d) => [d.day_ms, d.players] as [number, number]),
    })),
    earningFrom,
  };
}

export interface GameTotals {
  universeId: number;
  perYear: RevenueEstimate; // MODELLED: the latest month's estimate times 12
  total: RevenueEstimate;
  firstSeenMs: number;
  createdMs: number | null;
  lifetime: Lifetime | null;
}

// Tracked and lifetime totals for many games at once, for lists.
export async function getGameTotals(db: Db, ids: number[], listed: RankedGame[]): Promise<GameTotals[]> {
  if (!ids.length) return [];
  const games = await db.query<GameRow>(`select ${GAME_COLS} from games where universe_id = any($1::bigint[])`, [ids]);
  const { tracked } = await track(db, games, listed);
  return tracked.map((t) => {
    const last = t.months[t.months.length - 1];
    const k = (x: keyof RevenueEstimate) => (last ? last.est[x] * 12 : 0);
    return { universeId: t.universeId, perYear: { low: k("low"), mid: k("mid"), high: k("high") }, total: t.total, firstSeenMs: t.firstSeenMs, createdMs: t.createdMs, lifetime: t.lifetime };
  });
}

async function track(db: Db, games: GameRow[], listed: RankedGame[]) {
  const [earn] = await db.query<{ first: string | null; last: string | null; below: number | null }>(
    `select min(day)::text as first, max(day)::text as last,
            (select max(rank) + 1 from earning_ranks where day = (select max(day) from earning_ranks)) as below
     from earning_ranks`,
  );
  type Daily = { universe_id: number; day_ms: number; players: number; max: number };
  if (!games.length) return { tracked: [] as TrackedGame[], daily: new Map<number, Daily[]>(), earningFrom: earn?.first ?? null };

  const ids = games.map((g) => g.universe_id);
  const [months, ranks, daily, cur, visits] = await Promise.all([
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
    db.query<{ universe_id: number; v0: number | null; v1: number | null }>(
      `select universe_id::float8 as universe_id,
              (array_agg(visits_first order by day) filter (where visits_first > 0))[1]::float8 as v0,
              (array_agg(visits_last order by day desc) filter (where visits_last > 0))[1]::float8 as v1
       from game_daily where universe_id = any($1::bigint[]) group by 1`,
      [ids],
    ),
  ]);

  const group = <T extends { universe_id: number }>(xs: T[]) => {
    const m = new Map<number, T[]>();
    for (const x of xs) {
      const list = m.get(x.universe_id);
      if (list) list.push(x);
      else m.set(x.universe_id, [x]);
    }
    return m;
  };
  const monthsBy = group(months);
  const ranksBy = group(ranks);
  const dailyBy = group(daily);
  const nowMs = Date.now();
  const earnMonth = earn?.first?.slice(0, 7) ?? null;
  const cap = earn?.below ? estMonthlyDevEx(earn.below)!.mid : null;
  const tracked: TrackedGame[] = games.map((g) => {
    const perPlayer = perPlayerRange(listed, g.subgenre, g.genre);
    const rows = monthsBy.get(g.universe_id) ?? [];
    const days = dailyBy.get(g.universe_id) ?? [];
    const peakDay = days.reduce((a, d) => (d.max > a.max ? d : a), days[0] ?? { day_ms: g.first_ms, max: 0 });
    const rankEst = (r: (typeof rows)[number]): RevenueEstimate | null => {
      const ranked = ranksBy.get(g.universe_id)?.find((x) => x.m === r.m)?.ranks ?? [];
      if (!ranked.length) return null;
      // Listed that month: the rank-based estimate, averaged over its listed days.
      const ests = ranked.map((rank) => estMonthlyDevEx(rank)!);
      const mean = (k: keyof RevenueEstimate) => ests.reduce((a, e) => a + e[k], 0) / ests.length;
      return { low: mean("low"), mid: mean("mid"), high: mean("high") };
    };
    // A game's own spend per player beats its peers' (Adopt Me! earns about $7 a player against a listed median near $12),
    // so months before it was ranked use its own rate where one exists.
    const rankedRows = rows.map((r) => ({ r, est: rankEst(r) })).filter((x): x is { r: (typeof rows)[number]; est: RevenueEstimate } => !!x.est);
    const avgSum = rankedRows.reduce((a, x) => a + x.r.avg * x.r.days, 0);
    const own = (k: keyof RevenueEstimate) => rankedRows.reduce((a, x) => a + x.est[k] * x.r.days, 0) / avgSum;
    const ownPerPlayer = avgSum > 0 ? { low: own("low"), mid: own("mid"), high: own("high") } : null;
    const monthRows: MonthRow[] = rows.map((r) => {
      const ranked = ranksBy.get(g.universe_id)?.find((x) => x.m === r.m)?.ranks ?? [];
      let est: RevenueEstimate;
      let source: MonthRow["source"];
      const fromRank = rankEst(r);
      if (fromRank) {
        est = fromRank;
        source = "rank";
      } else if (ownPerPlayer) {
        est = { low: r.avg * ownPerPlayer.low, mid: r.avg * ownPerPlayer.mid, high: r.avg * ownPerPlayer.high };
        source = "own";
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
    const v = visits.find((x) => x.universe_id === g.universe_id);
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
      ownPerPlayer,
      total,
      lifetime: lifetimeEstimate(total, v?.v0 ?? null, v?.v1 ?? null),
    };
  });
  tracked.sort((a, b) => b.peak - a.peak);
  return { tracked, daily: dailyBy, earningFrom: earn?.first ?? null };
}

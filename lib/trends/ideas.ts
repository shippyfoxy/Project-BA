import type { Db } from "@/lib/db/client";
import { EARNING_WEEK, estMonthlyDevEx } from "./revenue";

// Game ideas: which words in game names, and which genres, are drawing
// players, earning and gaining, measured across every game we track.
// Patterns only: a word in a name doesn't make a game, but the same words
// recurring across rising games show what players are picking right now.

export const MIN_TERM_GAMES = 5; // a pattern needs at least this many games with 100+ players
export const COUNTED_MIN = 100; // games below this are too small to count as competitors
export const HIT_MIN = 1_000; // a launch that averages this many is a hit
const LAUNCH_DAYS = 30;
const MAX_START_AGE_DAYS = 60;

export type Momentum = "rising" | "crowding" | "steady" | "fading";

export interface IdeaGame {
  universeId: number;
  name: string;
  genre: string;
  subgenre: string | null; // Roblox's own, e.g. "Action RPG"; about 1 game in 5 has none
  cur7: number;
  prev7: number | null;
  launched: boolean; // reached the lists in the last 30 days, as a new game
  launchedBefore: boolean; // the same, in the 30 days before that
  effRank: number | null;
}

export interface Pattern {
  term: string;
  games: number; // with 100+ players
  players: number; // sum of 7-day averages
  growth: number | null; // this week against last, over games with both weeks
  vsMarket: number | null; // growth minus every game's growth, in points of 1
  median: number; // players per game, of games with 100+
  topShare: number; // the biggest game's share of the players
  launches: number; // new games using it in the last 30 days
  launchesBefore: number;
  hits: number; // of those launches, how many average 1,000+
  revenue: number; // MODELLED monthly payouts of its games in the Top Earning list
  earners: number;
  earnerRanks: number[]; // effective ranks, so the browser can total the estimate for Pro visitors
  momentum: Momentum;
  top: { universeId: number; name: string; cur7: number }[];
  genres: [string, number][]; // most common genres among its games
}

export interface GenreIdea {
  genre: string;
  games: number;
  players: number;
  growth: number | null;
  vsMarket: number | null;
  median: number;
  launches: number;
  launchesBefore: number;
  hits: number;
  revenue: number;
  earners: number;
  earnerRanks: number[];
  momentum: Momentum;
  parent?: string; // for a subgenre, the genre most of its games are in
}

export interface Ideas {
  day: string;
  marketGrowth: number | null; // every tracked game, this week against last
  launchRatio: number; // new games this month over the month before, across every game
  patterns: Pattern[];
  genres: GenreIdea[];
  subgenres: GenreIdea[];
}

// Words that say nothing about the game itself.
const STOP = new Set(
  "a an the of to in on and or for with my your you me i is it be by at from vs x it's its game games roblox new update upd beta alpha test testing official free best ultimate super mega 2 3 4 v2 v3 ii iii event classic remastered remake remade".split(
    " ",
  ),
);
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;
const TAGS = /[[(【][^\])】]*[\])】]/gu;

// The words of a name, with tags and emoji removed. "+1" style counters are
// kept as one word because "+1 Speed Every Second" is itself a pattern.
export function nameWords(raw: string): string[] {
  const clean = raw.replace(TAGS, " ").replace(EMOJI, " ").toLowerCase();
  return clean.match(/\+\d+|[\p{L}\p{N}']+/gu)?.map((w) => w.replace(/^'+|'+$/g, "")).filter(Boolean) ?? [];
}

// The words of a name that say something about the game.
export const distinctWords = (raw: string): string[] => [...new Set(nameWords(raw).filter((w) => !STOP.has(w) && !/^\d+$/.test(w) && w.length > 1))];

// One-word and two-word patterns in a name. A pair may include a small word
// ("steal a"), but not only small words or bare numbers.
export function nameTerms(raw: string): string[] {
  const words = nameWords(raw);
  const plain = (w: string) => !STOP.has(w) && !/^\d+$/.test(w) && w.length > 1;
  const out = new Set<string>();
  words.forEach((w, i) => {
    if (plain(w)) out.add(w);
    const next = words[i + 1];
    if (next && (plain(w) || plain(next)) && !/^\d+$/.test(w) && !/^\d+$/.test(next)) out.add(`${w} ${next}`);
  });
  return [...out];
}

// Against the market, so a quiet week for every game doesn't mark everything
// as fading. "Crowding" is new games arriving at least 1.5 times faster than
// across every game while players are not rising: studios piling in after a
// hit. marketLaunchRatio (every game's launches over the month before's) keeps
// a wider net, like the 24 country lists from 3 November, from reading as a rush.
export function momentumOf(vsMarket: number | null, launches: number, launchesBefore: number, marketLaunchRatio = 1): Momentum {
  if (vsMarket !== null && vsMarket >= 0.1) return "rising";
  if (vsMarket !== null && vsMarket <= -0.1) return "fading";
  if (launches >= 5 && launches >= launchesBefore * 1.5 * Math.max(marketLaunchRatio, 1)) return "crowding";
  return "steady";
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface Acc {
  games: IdeaGame[];
}

function summarise(games: IdeaGame[]) {
  const counted = games.filter((g) => g.cur7 >= COUNTED_MIN);
  const both = games.filter((g) => g.prev7 !== null && g.prev7 > 0);
  const nowBoth = both.reduce((a, g) => a + g.cur7, 0);
  const prevBoth = both.reduce((a, g) => a + g.prev7!, 0);
  const launched = games.filter((g) => g.launched);
  const earners = games.filter((g) => g.effRank !== null);
  return {
    games: counted.length,
    players: games.reduce((a, g) => a + g.cur7, 0),
    growth: prevBoth > 0 ? nowBoth / prevBoth - 1 : null,
    median: median(counted.map((g) => g.cur7)),
    launches: launched.length,
    launchesBefore: games.filter((g) => g.launchedBefore).length,
    hits: launched.filter((g) => g.cur7 >= HIT_MIN).length,
    revenue: earners.reduce((a, g) => a + estMonthlyDevEx(g.effRank)!.mid, 0),
    earners: earners.length,
    earnerRanks: earners.map((g) => g.effRank!),
  };
}

export function buildPatterns(games: IdeaGame[], marketGrowth: number | null, marketLaunchRatio = 1): Pattern[] {
  const byTerm = new Map<string, Acc>();
  for (const g of games) {
    for (const t of nameTerms(g.name)) {
      const acc = byTerm.get(t) ?? { games: [] };
      acc.games.push(g);
      byTerm.set(t, acc);
    }
  }
  const counted = new Map([...byTerm].map(([t, a]) => [t, a.games.filter((g) => g.cur7 >= COUNTED_MIN)]));
  const big = [...counted].filter(([, gs]) => gs.length >= MIN_TERM_GAMES);
  const sets = new Map(big.map(([t, gs]) => [t, new Map(gs.map((g) => [g.universeId, g.cur7]))]));
  const totals = new Map([...sets].map(([t, m]) => [t, [...m.values()].reduce((x, y) => x + y, 0)]));
  const words = (t: string) => t.split(" ").length;
  // Two patterns that are really the same games ("murder", "mystery" and
  // "murder mystery", all Murder Mystery 2) say one thing: when the smaller
  // sits mostly inside the larger and the games they share hold nearly all
  // of both's players, keep the more specific, then the bigger.
  const dropped = new Set<string>();
  for (const [a, sa] of sets) {
    for (const [b, sb] of sets) {
      if (a === b || dropped.has(b)) continue;
      let both = 0;
      let shared = 0;
      for (const [id, players] of sa) {
        if (!sb.has(id)) continue;
        both++;
        shared += players;
      }
      if (both < 0.8 * Math.min(sa.size, sb.size)) continue;
      if (shared < 0.9 * totals.get(a)! || shared < 0.9 * totals.get(b)!) continue;
      if (words(b) > words(a) || (words(b) === words(a) && (totals.get(b)! > totals.get(a)! || (totals.get(b) === totals.get(a) && b < a)))) {
        dropped.add(a);
        break;
      }
    }
  }
  const patterns: Pattern[] = [];
  for (const [term, acc] of byTerm) {
    if (!sets.has(term) || dropped.has(term)) continue;
    const mine = counted.get(term)!;
    const s = summarise(acc.games);
    const vsMarket = s.growth !== null && marketGrowth !== null ? s.growth - marketGrowth : null;
    const genreCount = new Map<string, number>();
    for (const g of mine) if (g.genre !== "All" && g.genre !== "Other") genreCount.set(g.genre, (genreCount.get(g.genre) ?? 0) + 1);
    const top = [...acc.games].sort((a, b) => b.cur7 - a.cur7);
    patterns.push({
      term,
      ...s,
      vsMarket,
      topShare: s.players > 0 ? top[0].cur7 / s.players : 0,
      momentum: momentumOf(vsMarket, s.launches, s.launchesBefore, marketLaunchRatio),
      top: top
        .slice(0, 3)
        .map((g) => ({ universeId: g.universeId, name: g.name, cur7: g.cur7 })),
      genres: [...genreCount].sort((a, b) => b[1] - a[1]).slice(0, 2),
    });
  }
  return patterns.sort((a, b) => b.players - a.players);
}

// Genres, or with `sub`, Roblox's subgenres; each needs 10+ games with 100+ players.
export function buildGenres(games: IdeaGame[], marketGrowth: number | null, sub = false, marketLaunchRatio = 1): GenreIdea[] {
  const by = new Map<string, IdeaGame[]>();
  for (const g of games) {
    const key = sub ? g.subgenre : g.genre;
    if (key) by.set(key, [...(by.get(key) ?? []), g]);
  }
  return [...by]
    .filter(([genre]) => genre !== "All" && genre !== "Other")
    .map(([genre, gs]) => {
      const s = summarise(gs);
      const vsMarket = s.growth !== null && marketGrowth !== null ? s.growth - marketGrowth : null;
      const parents = new Map<string, number>();
      for (const g of gs) parents.set(g.genre, (parents.get(g.genre) ?? 0) + 1);
      const parent = sub ? [...parents].sort((a, b) => b[1] - a[1])[0][0] : undefined;
      return { genre, ...s, vsMarket, momentum: momentumOf(vsMarket, s.launches, s.launchesBefore, marketLaunchRatio), parent };
    })
    .filter((g) => g.games >= 10)
    .sort((a, b) => b.players - a.players);
}

// Patterns across every game, or within one genre.
export async function getIdeas(db: Db, genre: string | null = null): Promise<Ideas | null> {
  const [latest] = await db.query<{ day: string | null }>(`select ((max(ts) at time zone 'UTC')::date - 1)::text as day from snapshots`);
  if (!latest?.day) return null;
  const rows = await db.query<{
    universe_id: number;
    name: string;
    genre: string;
    subgenre: string | null;
    cur7: number;
    prev7: number | null;
    launched: boolean;
    launched_before: boolean;
    eff_rank: number | null;
  }>(
    `with ${EARNING_WEEK},
     recent as (
       select universe_id,
         avg(playing_avg) filter (where day > $1::date - 7) as cur7,
         avg(playing_avg) filter (where day <= $1::date - 7) as prev7
       from game_daily
       where day > $1::date - 14 and day <= $1::date
       group by universe_id)
     select g.universe_id::float8 as universe_id, g.name, coalesce(nullif(g.genre_l1, 'All'), 'Other') as genre,
            nullif(g.genre_l2, '') as subgenre, r.cur7::float8 as cur7, r.prev7::float8 as prev7,
            (g.first_seen::date > $1::date - ${LAUNCH_DAYS}
              and g.first_seen::date - g.created_at::date <= ${MAX_START_AGE_DAYS}) as launched,
            (g.first_seen::date > $1::date - ${2 * LAUNCH_DAYS} and g.first_seen::date <= $1::date - ${LAUNCH_DAYS}
              and g.first_seen::date - g.created_at::date <= ${MAX_START_AGE_DAYS}) as launched_before,
            w.eff_rank
     from recent r
     join games g using (universe_id)
     left join earning_week w using (universe_id)
     where r.cur7 > 0`,
    [latest.day],
  );
  const games: IdeaGame[] = rows.map((r) => ({
    universeId: r.universe_id,
    name: r.name,
    genre: r.genre,
    subgenre: r.subgenre,
    cur7: r.cur7,
    prev7: r.prev7,
    launched: r.launched,
    launchedBefore: r.launched_before,
    effRank: r.eff_rank,
  }));
  const market = summarise(games);
  const marketGrowth = market.growth;
  const launchRatio = market.launchesBefore ? market.launches / market.launchesBefore : 1;
  return {
    day: latest.day,
    marketGrowth,
    launchRatio,
    patterns: buildPatterns(genre ? games.filter((g) => g.genre === genre) : games, marketGrowth, launchRatio),
    genres: buildGenres(games, marketGrowth, false, launchRatio),
    subgenres: buildGenres(games, marketGrowth, true, launchRatio),
  };
}

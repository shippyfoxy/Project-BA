import type { Db } from "@/lib/db/client";

export const PASS_MIN_PLAYERS = 1_000;
const MIN_GROUP_GAMES = 5;
// Robux to the creator's DevEx dollars: 70% of the price, at $0.0038 a Robux.
export const CREATOR_USD_PER_ROBUX = 0.7 * 0.0038;

// What a pass sells, guessed from its name. A pass can match more than one.
export const PASS_KINDS: [string, RegExp][] = [
  ["VIP", /\bvip\b/i],
  ["Double or more", /\b(2x|x2|3x|x3|5x|x5|10x|x10|double|triple)\b/i],
  ["Speed", /\b(speed|fast|faster|walkspeed|sprint)\b/i],
  ["Luck", /\b(luck|lucky)\b/i],
  ["Admin or commands", /\b(admin|commands?|cmds?)\b/i],
  ["Music or radio", /\b(radio|boombox|music)\b/i],
  ["Storage or slots", /\b(storage|slots?|inventory|backpack)\b/i],
  ["Auto", /\bauto\b/i],
];

export interface PriceSummary {
  n: number; // passes
  p25: number;
  median: number;
  p75: number;
  under100: number; // share of passes, 0 to 1
  over1000: number;
  common: { price: number; share: number }[]; // the three most used prices
}

const quantile = (s: number[], p: number) => {
  const i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};

export function summarisePrices(prices: number[]): PriceSummary | null {
  if (!prices.length) return null;
  const s = [...prices].sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (const p of s) counts.set(p, (counts.get(p) ?? 0) + 1);
  const common = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 3)
    .map(([price, c]) => ({ price, share: c / s.length }));
  return {
    n: s.length,
    p25: quantile(s, 0.25),
    median: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    under100: s.filter((p) => p < 100).length / s.length,
    over1000: s.filter((p) => p >= 1000).length / s.length,
    common,
  };
}

export const passKinds = (name: string) => PASS_KINDS.filter(([, re]) => re.test(name)).map(([k]) => k);

export interface PassGroup {
  genre: string;
  subgenre: string | null; // null: every game in the genre, or every game when genre is ""
  games: number; // games read
  withPasses: number; // share selling at least one pass
  passesPerGame: number | null; // median, among games that sell any
  price: PriceSummary | null;
  earnerMedian: number | null; // median price among Top Earning games, when 3+ of them sell passes
  earners: number;
}

export interface PassKindRow {
  kind: string;
  games: number; // share of games selling one
  median: number; // median price in Robux
}

export interface PassPricing {
  readFrom: string | null; // oldest read used, YYYY-MM-DD
  games: number;
  all: PassGroup;
  subgenres: PassGroup[];
  kinds: PassKindRow[];
}

type GameRow = { universe_id: number; genre: string; subgenre: string | null; listed: boolean; read_on: string; prices: number[]; names: string[] };

function group(genre: string, subgenre: string | null, rows: GameRow[]): PassGroup {
  const selling = rows.filter((r) => r.prices.length);
  const counts = selling.map((r) => r.prices.length).sort((a, b) => a - b);
  const earnerPrices = rows.filter((r) => r.listed && r.prices.length);
  return {
    genre,
    subgenre,
    games: rows.length,
    withPasses: rows.length ? selling.length / rows.length : 0,
    passesPerGame: counts.length ? quantile(counts, 0.5) : null,
    price: summarisePrices(rows.flatMap((r) => r.prices)),
    earnerMedian: earnerPrices.length >= 3 ? quantile(earnerPrices.flatMap((r) => r.prices).sort((a, b) => a - b), 0.5) : null,
    earners: earnerPrices.length,
  };
}

// Pass prices across games averaging 1,000+ players over the last 7 days, read in the last week.
export async function getPassPricing(db: Db): Promise<PassPricing | null> {
  const rows = await db.query<GameRow>(
    `with latest as (select max(day) as d from game_daily),
          cur as (select g.universe_id from game_daily g, latest
                  where g.day > latest.d - 7 and g.day <= latest.d group by 1 having avg(g.playing_avg) >= $1),
          earn as (select universe_id from earning_ranks where day = (select max(day) from earning_ranks))
     select r.universe_id::float8 as universe_id, coalesce(nullif(gm.genre_l1, 'All'), 'Other') as genre,
            nullif(gm.genre_l2, '') as subgenre, exists (select 1 from earn e where e.universe_id = r.universe_id) as listed,
            r.read_on::text as read_on,
            coalesce(array_agg(p.price order by p.pass_id) filter (where p.pass_id is not null), '{}') as prices,
            coalesce(array_agg(p.name order by p.pass_id) filter (where p.pass_id is not null), '{}') as names
     from cur join game_pass_reads r using (universe_id) join games gm using (universe_id)
     left join game_passes p on p.universe_id = r.universe_id and p.last_seen = r.read_on and p.for_sale and p.price > 0
     where r.read_on > (now() at time zone 'UTC')::date - 7
     group by 1, 2, 3, 4, 5`,
    [PASS_MIN_PLAYERS],
  );
  if (!rows.length) return null;
  const bySub = new Map<string, GameRow[]>();
  for (const r of rows) {
    const k = `${r.genre}|${r.subgenre ?? ""}`;
    const list = bySub.get(k);
    if (list) list.push(r);
    else bySub.set(k, [r]);
  }
  const subgenres = [...bySub.entries()]
    .filter(([k, rs]) => !k.endsWith("|") && rs.length >= MIN_GROUP_GAMES)
    .map(([k, rs]) => group(k.split("|")[0], k.split("|")[1], rs))
    .sort((a, b) => a.genre.localeCompare(b.genre) || (b.price?.median ?? 0) - (a.price?.median ?? 0));
  const kinds = PASS_KINDS.map(([kind]) => {
    const prices: number[] = [];
    let games = 0;
    for (const r of rows) {
      const hit = r.names.map((n, i) => (passKinds(n).includes(kind) ? r.prices[i] : null)).filter((p): p is number => p !== null);
      if (hit.length) games++;
      prices.push(...hit);
    }
    return { kind, games: games / rows.length, median: prices.length ? quantile(prices.sort((a, b) => a - b), 0.5) : 0 };
  })
    .filter((k) => k.games > 0)
    .sort((a, b) => b.games - a.games);
  return {
    readFrom: rows.reduce((m, r) => (r.read_on < m ? r.read_on : m), rows[0].read_on),
    games: rows.length,
    all: group("", null, rows),
    subgenres,
    kinds,
  };
}

export interface GamePass {
  id: number;
  name: string;
  price: number | null;
}

// One game's passes as last read, cheapest first; passes not on sale last.
export async function getGamePasses(db: Db, universeId: number): Promise<{ readOn: string; passes: GamePass[] } | null> {
  const [read] = await db.query<{ read_on: string }>(`select read_on::text as read_on from game_pass_reads where universe_id = $1`, [universeId]);
  if (!read) return null;
  const passes = await db.query<GamePass>(
    `select pass_id::float8 as id, name, price from game_passes
     where universe_id = $1 and last_seen = $2::date
     order by price is null, price, name`,
    [universeId, read.read_on],
  );
  return { readOn: read.read_on, passes };
}

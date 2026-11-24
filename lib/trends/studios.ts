import type { Db } from "@/lib/db/client";
import type { RankedGame } from "./revenuePage";

// Every studio we know a game for, ranked by modelled revenue, then players.
export const STUDIO_HIT = 5_000; // a best week this size counts as a hit

export interface StudioRow {
  kind: "group" | "user";
  id: number;
  name: string;
  games: number; // tracked games
  hits: number;
  players: number; // last 7 days, summed over its games
  estMonthly: number; // MODELLED, its games in the Top Earning list
  earners: number; // of its games in that list
  top: { universeId: number; name: string; players: number } | null;
}

export async function getStudios(db: Db, listed: RankedGame[]): Promise<StudioRow[]> {
  const rows = await db.query<{
    creator_type: string;
    creator_id: number;
    universe_id: number;
    name: string;
    creator_name: string | null;
    peak7: number | null;
    cur7: number | null;
  }>(
    `with last as (select max(day) as day from game_daily),
     cur as (
       select d.universe_id, avg(d.playing_avg)::float8 as cur7 from game_daily d, last
       where d.day >= last.day - 7 and d.day < last.day group by 1)
     select g.creator_type, g.creator_id::float8 as creator_id, g.universe_id::float8 as universe_id, g.name, g.creator_name,
            p.peak7::float8 as peak7, c.cur7
     from games g left join game_peaks p using (universe_id) left join cur c using (universe_id)
     where g.creator_id is not null and g.creator_type in ('Group', 'User')`,
  );
  const est = new Map(listed.map((g) => [g.universeId, g.estMonthly]));
  const by = new Map<string, StudioRow>();
  for (const r of rows) {
    const key = `${r.creator_type}:${r.creator_id}`;
    const s = by.get(key) ?? {
      kind: r.creator_type === "Group" ? "group" : "user",
      id: r.creator_id,
      name: r.creator_name ?? "Unknown",
      games: 0,
      hits: 0,
      players: 0,
      estMonthly: 0,
      earners: 0,
      top: null,
    };
    s.games++;
    if ((r.peak7 ?? 0) >= STUDIO_HIT) s.hits++;
    s.players += r.cur7 ?? 0;
    const e = est.get(r.universe_id);
    if (e) {
      s.estMonthly += e;
      s.earners++;
    }
    if ((r.cur7 ?? 0) > (s.top?.players ?? -1)) s.top = { universeId: r.universe_id, name: r.name, players: r.cur7 ?? 0 };
    by.set(key, s);
  }
  return [...by.values()].sort((a, b) => b.estMonthly - a.estMonthly || b.players - a.players);
}

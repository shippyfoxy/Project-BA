import type { Db } from "@/lib/db/client";
import type { BadgeRecord } from "@/lib/roblox/client";

const DAY_MS = 86_400_000;

// A badge awarded on joining. "Welcome Back" and similar go to returning
// players, so they are left out.
const WELCOME = /\b(welcome|first (join|visit|time|play)|you (joined|played|came)|joined (the )?game|thanks? (you )?for (playing|joining|visiting)|new player)\b|^\W*played\b/i;
const NOT_FIRST = /\b(back|again|return(ing|ed)?|veteran|old)\b/i;

// A badge added to a live game is earned by its existing players too until
// they have all returned once, so a young badge overcounts new players. One
// made within a week of the game itself had no existing players to count.
export const MIN_BADGE_AGE_DAYS = 60;
const LAUNCH_GRACE_DAYS = 7;

export function pickWelcomeBadge(badges: BadgeRecord[], nowMs: number, gameCreatedMs: number | null = null): BadgeRecord | null {
  const fits = badges.filter((b) => {
    const made = Date.parse(b.created);
    const settled = nowMs - made >= MIN_BADGE_AGE_DAYS * DAY_MS || (gameCreatedMs !== null && made - gameCreatedMs <= LAUNCH_GRACE_DAYS * DAY_MS);
    return b.enabled && WELCOME.test(b.name) && !NOT_FIRST.test(b.name) && settled;
  });
  return fits.reduce<BadgeRecord | null>((a, b) => (!a || b.statistics.awardedCount > a.statistics.awardedCount ? b : a), null);
}

// The share of a day's visits made by first-time players. Visits count every
// join, so this is a share of joins, not of people. A badge awarded more often
// than the game was joined is not a first-join badge, and too few visits make
// the share noise.
export const MIN_VISITS = 500;

export function newShare(newPlayers: number | null, visits: number | null): number | null {
  if (newPlayers === null || visits === null || visits < MIN_VISITS || newPlayers > visits) return null;
  return newPlayers / visits;
}

export interface WelcomeDay {
  dayMs: number;
  newPlayers: number;
  visits: number;
  share: number;
}

export interface GameWelcome {
  badgeName: string;
  days: WelcomeDay[];
  genreMedian: number | null; // latest share of every game in the genre with a reading this week
  genreGames: number;
}

export async function getGameWelcome(db: Db, universeId: number, genre: string): Promise<GameWelcome | null> {
  const rows = await db.query<{ day: string; badge_name: string; new_players: number; visits_24h: number | null }>(
    `select day::text, badge_name, new_players, visits_24h::float8 as visits_24h
     from welcome_badges
     where universe_id = $1::bigint and badge_id is not null
     order by day`,
    [universeId],
  );
  const days = rows.flatMap((r) => {
    const share = newShare(r.new_players, r.visits_24h);
    return share === null ? [] : [{ dayMs: Date.parse(r.day), newPlayers: r.new_players, visits: r.visits_24h!, share }];
  });
  if (!days.length) return null;

  const peers = await db.query<{ new_players: number; visits_24h: number | null }>(
    `select distinct on (w.universe_id) w.new_players, w.visits_24h::float8 as visits_24h
     from welcome_badges w join games g using (universe_id)
     where w.badge_id is not null and w.day > current_date - 7 and coalesce(g.genre_l1, 'Other') = $1
     order by w.universe_id, w.day desc`,
    [genre],
  );
  const shares = peers.flatMap((p) => newShare(p.new_players, p.visits_24h) ?? []).sort((a, b) => a - b);
  const mid = Math.floor(shares.length / 2);
  return {
    badgeName: rows[rows.length - 1].badge_name,
    days,
    genreMedian: shares.length >= 10 ? (shares.length % 2 ? shares[mid] : (shares[mid - 1] + shares[mid]) / 2) : null,
    genreGames: shares.length,
  };
}

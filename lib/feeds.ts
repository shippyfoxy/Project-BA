import type { Db } from "@/lib/db/client";
import { fmtDay, fmtInt, fmtPct } from "@/lib/format";
import { displayName } from "@/lib/trends/names";
import type { UpdateImpact } from "@/lib/trends/updates";
import { escapeXml } from "@/lib/trends/widget";
import { SITE } from "@/lib/widgets";

export interface FeedItem {
  guid: string;
  title: string;
  link: string;
  description: string;
  dateMs: number;
}

export function renderRss(channel: { title: string; path: string; description: string }, items: FeedItem[]): string {
  const latest = items.reduce((a, i) => Math.max(a, i.dateMs), 0) || Date.now();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${escapeXml(channel.title)}</title>
<link>${SITE}${escapeXml(channel.path)}</link>
<atom:link href="${SITE}${escapeXml(channel.path)}" rel="self" type="application/rss+xml"/>
<description>${escapeXml(channel.description)}</description>
<language>en-gb</language>
<lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>
<ttl>60</ttl>
${items
  .map(
    (i) => `<item>
<title>${escapeXml(i.title)}</title>
<link>${escapeXml(i.link)}</link>
<guid isPermaLink="false">${escapeXml(i.guid)}</guid>
<pubDate>${new Date(i.dateMs).toUTCString()}</pubDate>
<description>${escapeXml(i.description)}</description>
</item>`,
  )
  .join("\n")}
</channel>
</rss>
`;
}

// New games crossing 1,000, 10,000 and 100,000 players a day, by the first
// complete day each did. New means created in the last 120 days and reaching
// the discovery lists within 60 days of creation, as on the Launches page.
export const BREAKOUT_LEVELS = [1_000, 10_000, 100_000];

export async function breakoutItems(db: Db): Promise<FeedItem[]> {
  const rows = await db.query<{
    universe_id: number;
    name: string;
    genre: string;
    level: number;
    day: string;
    players: number;
    since: number;
  }>(
    `with last as (select max(day) - 1 as day from game_daily),
     cohort as (
       select universe_id, first_seen::date as d0 from games
       where created_at >= now() - interval '120 days' and first_seen::date - created_at::date <= 60),
     crossed as (
       select d.universe_id, t.level, min(d.day) as day
       from game_daily d join cohort c using (universe_id) cross join last
       cross join (values ${BREAKOUT_LEVELS.map((l) => `(${l})`).join(", ")}) t(level)
       where d.day >= c.d0 and d.day <= last.day and d.playing_avg >= t.level
       group by d.universe_id, t.level)
     select distinct on (x.universe_id, x.day)
            x.universe_id::float8 as universe_id, g.name, coalesce(g.genre_l1, 'Other') as genre, x.level,
            x.day::text as day, d.playing_avg::float8 as players, (x.day - c.d0)::int as since
     from crossed x
     join games g using (universe_id)
     join cohort c using (universe_id)
     join game_daily d on d.universe_id = x.universe_id and d.day = x.day
     where x.day > (select day from last) - 30
     order by x.universe_id, x.day, x.level desc`,
  );
  return rows
    .sort((a, b) => b.day.localeCompare(a.day) || b.level - a.level)
    .slice(0, 50)
    .map((r) => {
      const name = displayName(r.name);
      const dayMs = Date.parse(r.day);
      return {
        guid: `breakout-${r.universe_id}-${r.level}`,
        title: `${name} passed ${fmtInt(r.level)} players a day`,
        link: `${SITE}/games/${r.universe_id}`,
        description:
          `${name} (${r.genre}) averaged ${fmtInt(r.players)} players on ${fmtDay(dayMs)}, ` +
          `${r.since === 0 ? "the day it" : `${r.since} day${r.since === 1 ? "" : "s"} after it`} first reached Roblox's discovery lists.`,
        // The day ends before it can be reported.
        dateMs: dayMs + 86_400_000,
      };
    });
}

// Announced updates (a new tag in the title), once two days after them are in.
export function updateItems(impact: UpdateImpact): FeedItem[] {
  return impact.recent.map((u) => {
    const name = displayName(u.name);
    return {
      guid: `update-${u.universeId}-${new Date(u.dayMs).toISOString().slice(0, 10)}`,
      title: `${name}: ${fmtPct(u.lift * 100)} two days after an update`,
      link: `${SITE}/games/${u.universeId}`,
      description:
        `${u.genre}. The title changed from "${u.prevName}" to "${u.name}" on ${fmtDay(u.dayMs)}. ` +
        `Players on the two days after: ${fmtPct(u.lift * 100)} against the same days a week earlier (${fmtInt(u.before)} a day before).`,
      dateMs: u.dayMs + 3 * 86_400_000,
    };
  });
}

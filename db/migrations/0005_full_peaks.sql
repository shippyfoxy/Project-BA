-- A best 7-day average counts as full when at least 5 of its 7 days have
-- readings; until a game has one, its peak is provisional (from whatever
-- days exist) and any full window replaces it. Rebuilt by
-- scripts/db-rebuild-peaks.ts.
alter table game_peaks add column peak7_full boolean not null default false;

-- Earlier runs left ranks for games that dropped out of the list later the
-- same day. Keep only each day's latest complete list.
delete from earning_ranks e
using (select day, max(ts) as ts from earning_ranks group by day) latest
where e.day = latest.day
  and e.ts < latest.ts
  and (select count(*) from earning_ranks x where x.day = latest.day and x.ts = latest.ts) >= 300;

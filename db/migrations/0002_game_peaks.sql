-- Per-game all-time figures, kept current by each refresh (refreshPeaks in
-- lib/db/ingest.ts) so pages never have to scan the full daily history.

create table game_peaks (
  universe_id       bigint primary key references games (universe_id),
  peak7             real not null,    -- best 7-day average of daily averages
  peak7_day         date not null,    -- last day of that 7-day window
  first_million_day date,             -- first day the 7-day average reached 1M
  days_tracked      integer not null  -- days with at least one reading
);

insert into game_peaks (universe_id, peak7, peak7_day, first_million_day, days_tracked)
select universe_id,
       (array_agg(r7 order by r7 desc, day))[1],
       (array_agg(day order by r7 desc, day))[1],
       min(day) filter (where r7 >= 1000000),
       count(*)
from (
  select universe_id, day,
         avg(playing_avg) over (partition by universe_id order by day
           range between interval '6 days' preceding and current row) as r7
  from game_daily
) rolled
group by universe_id;

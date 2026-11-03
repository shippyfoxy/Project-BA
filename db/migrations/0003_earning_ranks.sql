-- Position in Roblox's public Top Earning list (7-day Robux spend), one row
-- per game per UTC day, holding the latest rank seen that day.
create table earning_ranks (
  universe_id bigint not null references games (universe_id),
  day         date not null,
  rank        smallint not null,
  ts          timestamptz not null,
  primary key (universe_id, day)
);

create index earning_ranks_day_idx on earning_ranks (day);

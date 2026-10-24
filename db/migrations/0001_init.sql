-- Roblox Pulse V2 core schema.
--
-- Storage budget is the Neon free tier (~0.5 GB), so history is kept at two
-- resolutions: raw 30-minute readings for a short window (observations) and
-- one row per game per UTC day forever (game_daily). Raw rows are rolled up
-- before they are pruned; see lib/db/ingest.ts.

-- One row per universe, holding the most recently seen metadata.
create table games (
  universe_id        bigint primary key,
  root_place_id      bigint not null,
  name               text not null,
  creator_name       text,
  genre_l1           text,
  genre_l2           text,
  created_at         timestamptz,
  canonical_url_path text,
  minimum_age        smallint,
  age_recommendation text,
  first_seen         timestamptz not null,
  last_seen          timestamptz not null
);

create index games_genre_l1_idx on games (genre_l1);

-- One row per refresh run. git_sha is set for rows imported from git history.
create table snapshots (
  ts         timestamptz primary key,
  game_count integer not null,
  source     text not null,
  git_sha    text
);

-- Raw readings. favorites/votes are null for readings recovered only from a
-- snapshot's rolling samples array, which carries playing and visits alone.
create table observations (
  universe_id bigint not null references games (universe_id),
  ts          timestamptz not null,
  playing     integer not null,
  visits      bigint not null,
  favorites   integer,
  up_votes    integer,
  down_votes  integer,
  primary key (universe_id, ts)
);

create index observations_ts_brin on observations using brin (ts);

-- Daily rollup, kept forever. Daily new visits are visits_last minus the
-- previous day's visits_last; the first/last pair gives in-day velocity.
create table game_daily (
  universe_id     bigint not null references games (universe_id),
  day             date not null,
  samples         smallint not null,
  playing_avg     real not null,
  playing_min     integer not null,
  playing_max     integer not null,
  playing_max_at  timestamptz not null,
  first_ts        timestamptz not null,
  last_ts         timestamptz not null,
  visits_first    bigint not null,
  visits_last     bigint not null,
  favorites_last  integer,
  up_votes_last   integer,
  down_votes_last integer,
  primary key (universe_id, day)
);

create index game_daily_day_idx on game_daily (day);

-- Which explore-api country/device slices surfaced a game on a given day.
-- Only populated from 2026-05-10 onward, when the seed fan-out was added.
create table game_presence_daily (
  universe_id bigint not null references games (universe_id),
  day         date not null,
  countries   text[] not null default '{}',
  devices     text[] not null default '{}',
  primary key (universe_id, day)
);

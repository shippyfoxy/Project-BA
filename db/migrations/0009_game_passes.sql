-- Each game's passes as last read: name and price in Robux. Current state
-- only, no daily history, to stay small. A pass counts as current when its
-- last_seen matches the game's latest read in game_pass_reads; one that has
-- gone from the game keeps its older last_seen.
create table game_passes (
  pass_id     bigint primary key,
  universe_id bigint not null references games (universe_id),
  name        text not null,
  price       integer, -- Robux charged now; null when not for sale
  for_sale    boolean not null,
  created_at  timestamptz,
  updated_at  timestamptz,
  first_seen  date not null,
  last_seen   date not null
);
create index game_passes_universe_idx on game_passes (universe_id, last_seen);

create table game_pass_reads (
  universe_id bigint primary key references games (universe_id),
  read_on     date not null,
  passes      integer not null
);

-- Every publish we have seen. Roblox's "updated" time changes on each one,
-- including small fixes, so this is publishing activity, not big updates.
create table game_updates (
  universe_id bigint not null references games (universe_id),
  updated_at  timestamptz not null,
  seen_at     timestamptz not null,
  primary key (universe_id, updated_at)
);

-- Every title a game has had. Studios announce real updates and events in
-- the title ("[UPD 21] Anime Adventures"), so a changed tag marks one.
-- prev_seen is when the previous title was last seen, which bounds how late
-- the change was spotted.
create table game_names (
  universe_id bigint not null references games (universe_id),
  name        text not null,
  first_seen  timestamptz not null,
  prev_seen   timestamptz,
  primary key (universe_id, first_seen)
);

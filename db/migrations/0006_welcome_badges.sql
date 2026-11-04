-- One reading a day of each game's Welcome badge. Most games award one on a
-- player's first visit, so its awards over the past 24 hours count new
-- players. badge_id is null when the game has no usable Welcome badge, which
-- spares re-checking it for a week. visits_24h is the game's visits over
-- about the same 24 hours, from our own readings.
create table welcome_badges (
  universe_id bigint not null references games (universe_id),
  day         date not null,
  ts          timestamptz not null,
  badge_id    bigint,
  badge_name  text,
  new_players integer,
  visits_24h  bigint,
  primary key (universe_id, day)
);

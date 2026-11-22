-- Who made each game, as Roblox identifies them, so a studio's games can be
-- listed together. Names can change or collide; the id and type cannot.
alter table games add column creator_id bigint, add column creator_type text;
create index games_creator_idx on games (creator_type, creator_id);

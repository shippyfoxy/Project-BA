// One-off: fills games.creator_id and creator_type for every known game from
// Roblox's games API. The hourly refresh keeps them current after this.

import { getGames } from "../lib/roblox/client";
import { openDb } from "./_db";

async function main() {
  const { db, label } = await openDb();
  try {
    const ids = (await db.query<{ id: number }>("select universe_id::float8 as id from games where creator_id is null")).map((r) => r.id);
    console.log(`[creators] ${label}: ${ids.length} games without a creator id`);
    const games = await getGames(ids);
    const rows = games
      .filter((g) => g.id > 0 && g.creator?.id)
      .map((g) => ({ universe_id: g.id, creator_id: g.creator.id, creator_type: g.creator.type }));
    for (let i = 0; i < rows.length; i += 500) {
      await db.query(
        `update games g set creator_id = x.creator_id, creator_type = x.creator_type
         from jsonb_to_recordset($1::text::jsonb) as x(universe_id bigint, creator_id bigint, creator_type text)
         where g.universe_id = x.universe_id`,
        [JSON.stringify(rows.slice(i, i + 500))],
      );
    }
    console.log(`[creators] filled ${rows.length}`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[creators] failed:", err);
  process.exit(1);
});

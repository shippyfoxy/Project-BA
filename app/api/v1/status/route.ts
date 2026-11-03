import { NextResponse } from "next/server";
import { getSiteDb } from "@/lib/db/site";

export const dynamic = "force-dynamic";

// Reports where the site's data comes from and how fresh it is. One small
// query, so polling it costs the database almost nothing.
export async function GET() {
  const db = getSiteDb();
  let body: Record<string, unknown> = { source: "file", generatedAt: null, games: null };
  if (db) {
    try {
      const [r] = await db.query<{ ts: string | null; games: number | null }>(
        `select to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ts, game_count as games
         from snapshots order by ts desc limit 1`,
      );
      if (r?.ts) body = { source: "database", generatedAt: r.ts, games: r.games };
    } catch (err) {
      console.error("[status] database read failed:", err);
    }
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=60" } });
}

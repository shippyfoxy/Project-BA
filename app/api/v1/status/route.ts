import { NextResponse } from "next/server";
import { loadSnapshotWithSource } from "@/lib/snapshot/loader";

export const dynamic = "force-dynamic";

// Reports where the site's data comes from and how fresh it is.
export async function GET() {
  const { snapshot, source } = await loadSnapshotWithSource();
  return NextResponse.json(
    {
      source,
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      generatedAt: snapshot.generatedAt,
      games: snapshot.games.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

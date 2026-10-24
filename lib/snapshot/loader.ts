import { promises as fs } from "node:fs";
import path from "node:path";
import { loadSnapshotFromDb } from "@/lib/db/read";
import { getSiteDb } from "@/lib/db/site";
import type { Snapshot } from "./schema";

export type SnapshotSource = "database" | "file";

let fileCache: { value: Snapshot; mtimeMs: number } | null = null;

async function loadSnapshotFromFile(): Promise<Snapshot> {
  const file = path.resolve(process.cwd(), "data/snapshots/latest.json");
  const stat = await fs.stat(file);
  if (fileCache && fileCache.mtimeMs === stat.mtimeMs) return fileCache.value;

  const raw = await fs.readFile(file, "utf8");
  const value = JSON.parse(raw) as Snapshot;
  fileCache = { value, mtimeMs: stat.mtimeMs };
  return value;
}

// Neon is the source of truth when DATABASE_URL is set. The committed JSON
// snapshot is the fallback, so the site still renders if the database is
// unreachable or not configured.
export async function loadSnapshotWithSource(): Promise<{ snapshot: Snapshot; source: SnapshotSource }> {
  const db = getSiteDb();
  if (db) {
    try {
      const snapshot = await loadSnapshotFromDb(db);
      if (snapshot) return { snapshot, source: "database" };
      console.warn("[loader] database has no snapshots yet; using the committed JSON");
    } catch (err) {
      console.error("[loader] database read failed; using the committed JSON:", err);
    }
  }
  return { snapshot: await loadSnapshotFromFile(), source: "file" };
}

export async function loadSnapshot(): Promise<Snapshot> {
  return (await loadSnapshotWithSource()).snapshot;
}

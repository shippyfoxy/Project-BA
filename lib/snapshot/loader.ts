import { promises as fs } from "node:fs";
import path from "node:path";
import type { Db } from "@/lib/db/client";
import { connectPostgres } from "@/lib/db/postgres";
import { loadSnapshotFromDb } from "@/lib/db/read";
import type { Snapshot } from "./schema";

let fileCache: { value: Snapshot; mtimeMs: number } | null = null;
let db: Db | null = null;

async function loadSnapshotFromFile(): Promise<Snapshot> {
  const file = path.resolve(process.cwd(), "data/snapshots/latest.json");
  const stat = await fs.stat(file);
  if (fileCache && fileCache.mtimeMs === stat.mtimeMs) return fileCache.value;

  const raw = await fs.readFile(file, "utf8");
  const value = JSON.parse(raw) as Snapshot;
  fileCache = { value, mtimeMs: stat.mtimeMs };
  return value;
}

// Neon is the source of truth when DATABASE_URL is set (the pooled endpoint,
// which suits serverless). The committed JSON snapshot is the fallback, so the
// site still renders if the database is unreachable or not configured.
export async function loadSnapshot(): Promise<Snapshot> {
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      db ??= connectPostgres(url, { idleTimeout: 20 });
      const snapshot = await loadSnapshotFromDb(db);
      if (snapshot) return snapshot;
      console.warn("[loader] database has no snapshots yet; using the committed JSON");
    } catch (err) {
      console.error("[loader] database read failed; using the committed JSON:", err);
    }
  }
  return loadSnapshotFromFile();
}

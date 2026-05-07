import { promises as fs } from "node:fs";
import path from "node:path";
import type { Snapshot } from "./schema";

let cache: { value: Snapshot; mtimeMs: number } | null = null;

export async function loadSnapshot(): Promise<Snapshot> {
  const file = path.resolve(process.cwd(), "data/snapshots/latest.json");
  const stat = await fs.stat(file);
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.value;

  const raw = await fs.readFile(file, "utf8");
  const value = JSON.parse(raw) as Snapshot;
  cache = { value, mtimeMs: stat.mtimeMs };
  return value;
}

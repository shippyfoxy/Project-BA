import { connectPglite, connectPostgres, type Db } from "../lib/db/client";

export function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

// `--pglite <dir>` runs against a local on-disk PGlite database; otherwise
// DATABASE_URL (the Neon connection string) is required.
export async function openDb(): Promise<{ db: Db; label: string }> {
  const dir = argValue("--pglite");
  if (dir) return { db: await connectPglite(dir), label: `pglite:${dir}` };
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Pass --pglite <dir> to use a local database instead.");
  }
  return { db: connectPostgres(url), label: new URL(url).host };
}

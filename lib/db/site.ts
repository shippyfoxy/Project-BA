import type { Db } from "./client";
import { connectPostgres } from "./postgres";

let db: Db | null = null;

// One shared connection for server rendering. Uses DATABASE_URL, the pooled
// endpoint, which suits serverless; null when the site has no database.
export function getSiteDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  db ??= connectPostgres(url, { idleTimeout: 20 });
  return db;
}

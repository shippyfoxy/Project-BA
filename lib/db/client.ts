import postgres from "postgres";

// One query surface for both Neon (postgres.js) and PGlite (tests, local
// backfill runs), so ingest SQL is exercised identically in both places.
// Bulk writes pass rows as one JSON string cast with `$1::text::jsonb`:
// array parameters differ between the drivers, and postgres.js re-encodes a
// parameter typed jsonb, so the text cast keeps the string untouched.
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
  close(): Promise<void>;
}

export function connectPostgres(url: string): Db {
  // max: 1 keeps begin/commit on one connection; prepare: false is required
  // behind Neon's pooled (PgBouncer) endpoint.
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    connection: { TimeZone: "UTC" },
  });
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await sql.unsafe(text, params as never[])) as unknown as T[];
    },
    async exec(text: string) {
      await sql.unsafe(text);
    },
    close: () => sql.end(),
  };
}

export async function connectPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(dataDir);
  // PGlite inherits the host's time zone; match Neon's UTC.
  await pg.exec("set timezone = 'UTC'");
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, params)).rows;
    },
    async exec(text: string) {
      await pg.exec(text);
    },
    close: () => pg.close(),
  };
}

export async function transaction<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    const out = await fn();
    await db.query("commit");
    return out;
  } catch (err) {
    await db.query("rollback");
    throw err;
  }
}

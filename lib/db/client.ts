import postgres from "postgres";

// One query surface for both Neon (postgres.js) and PGlite (tests, local
// backfill runs), so ingest SQL is exercised identically in both places.
// Bulk writes pass rows as one JSON string cast with `$1::text::jsonb`:
// array parameters differ between the drivers, and postgres.js re-encodes a
// parameter typed jsonb, so the text cast keeps the string untouched.
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
}

export interface Db extends Queryable {
  // Uses the driver's own transaction API so every statement runs on one
  // reserved connection. A bare BEGIN is not safe: postgres.js recycles
  // connections after 30-60 minutes without knowing a transaction is open.
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function postgresQueryable(sql: Pick<postgres.Sql, "unsafe">): Queryable {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await sql.unsafe(text, params as never[])) as unknown as T[];
    },
    async exec(text: string) {
      await sql.unsafe(text);
    },
  };
}

export function connectPostgres(url: string): Db {
  // prepare: false is required behind Neon's pooled (PgBouncer) endpoint.
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    connection: { TimeZone: "UTC" },
  });
  return {
    ...postgresQueryable(sql),
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return (await sql.begin((tx) => fn(postgresQueryable(tx)))) as T;
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
    transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return pg.transaction((tx) =>
        fn({
          async query<R>(text: string, params: unknown[] = []) {
            return (await tx.query<R>(text, params)).rows;
          },
          async exec(text: string) {
            await tx.exec(text);
          },
        }),
      );
    },
    close: () => pg.close(),
  };
}

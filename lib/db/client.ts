// One query surface for both Neon (postgres.js, lib/db/postgres.ts) and PGlite
// (tests and local backfill runs, lib/db/pglite.ts), so ingest SQL is
// exercised identically in both places. They live in separate files so the
// website bundle never pulls in PGlite.
//
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

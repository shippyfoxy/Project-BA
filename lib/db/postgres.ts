import postgres from "postgres";
import type { Db, Queryable } from "./client";

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

export interface PostgresOptions {
  // Seconds before an idle connection closes. Leave unset for scripts; the
  // website sets it so warm serverless instances don't hold connections.
  idleTimeout?: number;
}

export function connectPostgres(url: string, opts: PostgresOptions = {}): Db {
  // prepare: false is required behind Neon's pooled (PgBouncer) endpoint.
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    connection: { TimeZone: "UTC" },
    idle_timeout: opts.idleTimeout,
  });
  return {
    ...postgresQueryable(sql),
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return (await sql.begin((tx) => fn(postgresQueryable(tx)))) as T;
    },
    close: () => sql.end(),
  };
}

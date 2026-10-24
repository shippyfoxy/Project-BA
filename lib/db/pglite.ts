import type { Db, Queryable } from "./client";

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

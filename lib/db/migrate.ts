import { promises as fs } from "node:fs";
import path from "node:path";
import type { Db } from "./client";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");
const NAME_RE = /^\d{4}_[a-z0-9_]+\.sql$/;

export async function applyMigrations(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.exec(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const done = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name),
  );

  const files = (await fs.readdir(dir)).filter((f) => NAME_RE.test(f)).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("insert into schema_migrations (name) values ($1)", [file]);
    });
    applied.push(file);
  }
  return applied;
}

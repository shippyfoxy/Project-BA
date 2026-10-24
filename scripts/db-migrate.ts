import { applyMigrations } from "../lib/db/migrate";
import { openDb } from "./_db";

async function main() {
  const { db, label } = await openDb();
  try {
    const applied = await applyMigrations(db);
    console.log(
      applied.length > 0
        ? `[migrate] ${label}: applied ${applied.join(", ")}`
        : `[migrate] ${label}: up to date`,
    );
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});

// Sanity-checks data/snapshots/latest.json. Run via `pnpm validate-snapshot`.
// Exits non-zero on any error-level invariant; warnings are printed but do
// not fail the run. The intent is to catch silent breakage in the refresh
// pipeline (NaN proxies, samples going backwards, duplicate ids, etc.) before
// it lands on the dashboard.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Snapshot, SnapshotGame } from "../lib/snapshot/schema";
import {
  gameRetentionProxy,
  gameSessionMinutes,
} from "../lib/snapshot/aggregate";

const SNAPSHOT_PATH = path.resolve(process.cwd(), "data/snapshots/latest.json");

interface Issue {
  level: "error" | "warn";
  category: string;
  message: string;
  universeId?: number;
}

const issues: Issue[] = [];
const error = (category: string, message: string, universeId?: number) =>
  issues.push({ level: "error", category, message, universeId });
const warn = (category: string, message: string, universeId?: number) =>
  issues.push({ level: "warn", category, message, universeId });

function validateGame(g: SnapshotGame, snapshotMs: number) {
  const id = g.universeId;

  if (!Number.isInteger(g.universeId) || g.universeId <= 0) {
    error("universeId", `non-positive or non-integer universeId`, id);
  }
  // NaN/non-finite → error (would propagate as NaN through the proxy if
  // unguarded). Negative-but-finite → warn (Roblox occasionally returns
  // negative favoritedCount; the proxy code clamps these to 0).
  const checkCount = (label: string, n: number) => {
    if (!Number.isFinite(n)) error("counts", `non-finite ${label} ${n}`, id);
    else if (n < 0) warn("counts", `negative ${label} ${n}`, id);
  };
  checkCount("upVotes", g.upVotes);
  checkCount("downVotes", g.downVotes);
  checkCount("playing", g.playing);
  checkCount("visits", g.visits);
  checkCount("favoritedCount", g.favoritedCount);

  // Lifetime visits should always be >= current concurrent — visits is the
  // cumulative session count; if playing > visits the data is broken.
  if (g.playing > g.visits) {
    warn("counts", `playing (${g.playing}) > visits (${g.visits})`, id);
  }

  const created = Date.parse(g.created);
  const updated = Date.parse(g.updated);
  if (!Number.isFinite(created)) error("dates", `unparseable created ${g.created}`, id);
  if (!Number.isFinite(updated)) error("dates", `unparseable updated ${g.updated}`, id);
  if (Number.isFinite(created) && Number.isFinite(updated) && updated < created) {
    warn("dates", `updated (${g.updated}) < created (${g.created})`, id);
  }

  if (!Array.isArray(g.samples) || g.samples.length === 0) {
    error("samples", `missing or empty samples`, id);
    return;
  }

  for (let i = 0; i < g.samples.length; i++) {
    const s = g.samples[i];
    if (!Number.isFinite(s.ts) || s.ts <= 0) {
      error("samples", `bad ts at index ${i}`, id);
    }
    if (!Number.isFinite(s.playing)) error("samples", `non-finite playing at index ${i}`, id);
    else if (s.playing < 0) warn("samples", `negative playing at index ${i}`, id);
    if (!Number.isFinite(s.visits)) error("samples", `non-finite visits at index ${i}`, id);
    else if (s.visits < 0) warn("samples", `negative visits at index ${i}`, id);
    if (i > 0) {
      const prev = g.samples[i - 1];
      if (s.ts <= prev.ts) {
        error("samples", `timestamps not strictly increasing at index ${i}`, id);
      }
      if (s.visits < prev.visits) {
        warn("samples", `visits went backwards at index ${i}`, id);
      }
    }
  }

  const lastSample = g.samples[g.samples.length - 1];
  if (lastSample.ts > snapshotMs + 60_000) {
    warn("samples", `last sample.ts ${lastSample.ts} > snapshot ts (clock skew?)`, id);
  }

  const proxy = gameRetentionProxy(g);
  if (!Number.isFinite(proxy)) {
    error("proxy", `retentionProxy returned non-finite ${proxy}`, id);
  }
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const fmt = new Intl.NumberFormat("en-GB");

function printDistribution(label: string, values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  console.log(
    `  ${label.padEnd(22)} min=${fmt.format(sorted[0] ?? 0)}  ` +
      `med=${fmt.format(Math.round(quantile(sorted, 0.5)))}  ` +
      `p95=${fmt.format(Math.round(quantile(sorted, 0.95)))}  ` +
      `max=${fmt.format(sorted[sorted.length - 1] ?? 0)}`,
  );
}

async function main() {
  const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
  const snapshot = JSON.parse(raw) as Snapshot;

  if (!Array.isArray(snapshot.games) || snapshot.games.length === 0) {
    console.error("[validate] snapshot has no games — aborting");
    process.exit(1);
  }

  const generatedMs = Number.isFinite(snapshot.generatedAtMs)
    ? snapshot.generatedAtMs
    : Date.parse(snapshot.generatedAt);
  if (!Number.isFinite(generatedMs)) {
    error("snapshot", `unparseable generatedAt: ${snapshot.generatedAt}`);
  }

  const seen = new Set<number>();
  for (const g of snapshot.games) {
    if (seen.has(g.universeId)) {
      error("dedupe", `duplicate universeId ${g.universeId} (${g.name})`);
    }
    seen.add(g.universeId);
    validateGame(g, generatedMs);
  }

  const cohortable = snapshot.games.filter(
    (g) => gameSessionMinutes(g) !== null,
  ).length;
  const proxies = snapshot.games.map(gameRetentionProxy);
  const nonZeroProxies = proxies.filter((p) => p > 0).length;

  console.log("=== Snapshot validation ===");
  console.log(
    `generatedAt: ${snapshot.generatedAt}  games: ${snapshot.games.length}  source: ${snapshot.source}`,
  );
  console.log("");

  console.log("Distributions:");
  printDistribution("playing (concurrent)", snapshot.games.map((g) => g.playing));
  printDistribution("visits (lifetime)", snapshot.games.map((g) => g.visits));
  printDistribution("favoritedCount", snapshot.games.map((g) => g.favoritedCount));
  printDistribution("retentionProxy", proxies);
  console.log("");

  console.log("Coverage:");
  console.log(
    `  cohort-eligible (≥2 samples, growing visits): ${cohortable}/${snapshot.games.length} ` +
      `(${((cohortable / snapshot.games.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  non-zero retention proxy:                     ${nonZeroProxies}/${snapshot.games.length} ` +
      `(${((nonZeroProxies / snapshot.games.length) * 100).toFixed(1)}%)`,
  );
  console.log("");

  const top10 = [...snapshot.games].sort((a, b) => b.playing - a.playing).slice(0, 10);
  console.log("Top 10 by concurrent (eyeball check):");
  for (const g of top10) {
    console.log(
      `  ${fmt.format(g.playing).padStart(8)}  ${g.name.slice(0, 50).padEnd(50)} ` +
        `[${g.genreL1 || "-"}] ${g.creatorName}`,
    );
  }
  console.log("");

  const errs = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");

  if (warns.length > 0) {
    console.log(`Warnings (${warns.length}):`);
    for (const w of warns.slice(0, 20)) {
      const ctx = w.universeId ? ` (id=${w.universeId})` : "";
      console.log(`  [${w.category}] ${w.message}${ctx}`);
    }
    if (warns.length > 20) console.log(`  ... and ${warns.length - 20} more`);
    console.log("");
  }

  if (errs.length > 0) {
    console.log(`Errors (${errs.length}):`);
    for (const e of errs.slice(0, 20)) {
      const ctx = e.universeId ? ` (id=${e.universeId})` : "";
      console.log(`  [${e.category}] ${e.message}${ctx}`);
    }
    if (errs.length > 20) console.log(`  ... and ${errs.length - 20} more`);
    process.exit(1);
  }

  console.log("OK: all invariants pass");
}

main().catch((err) => {
  console.error("[validate] failed:", err);
  process.exit(1);
});

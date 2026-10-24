import type { Db } from "./client";
import {
  DAY_MS,
  ingestSnapshot,
  pruneObservations,
  refreshPeaks,
  retentionCutoff,
  rollupDays,
  snapshotTs,
  utcDay,
  type IngestResult,
  type IngestSnapshot,
} from "./ingest";

export interface RecordResult extends IngestResult {
  rolledUpRows: number;
  peaksUpdated: number;
  prunedRows: number;
}

// Stores one freshly fetched snapshot, recomputes the daily rollup and peaks
// for the days it can still affect, and prunes raw readings past the retention
// window. Only the top-level reading is stored: the snapshot's rolling samples
// are earlier refreshes the database already has. Idle games (nobody playing)
// are skipped to keep storage within the free tier.
export async function recordSnapshot(db: Db, snap: IngestSnapshot, nowMs = Date.now()): Promise<RecordResult> {
  const res = await ingestSnapshot(db, snap, { includeSamples: false, skipIdle: true });
  const ts = snapshotTs(snap);
  const from = utcDay(ts - DAY_MS);
  const to = utcDay(ts + DAY_MS);
  const rolledUpRows = await rollupDays(db, from, to);
  const peaksUpdated = await refreshPeaks(db, from, to);
  const prunedRows = await pruneObservations(db, retentionCutoff(nowMs));
  return { ...res, rolledUpRows, peaksUpdated, prunedRows };
}

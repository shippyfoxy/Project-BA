import type { Db } from "./client";
import {
  DAY_MS,
  ingestSnapshot,
  pruneObservations,
  retentionCutoff,
  rollupDays,
  snapshotTs,
  utcDay,
  type IngestResult,
  type IngestSnapshot,
} from "./ingest";

export interface RecordResult extends IngestResult {
  rolledUpRows: number;
  prunedRows: number;
}

// Stores one freshly fetched snapshot, recomputes the daily rollup for the
// days it can still affect, and prunes raw readings past the retention window.
// Only the top-level reading is stored: the snapshot's rolling samples are
// earlier refreshes the database already has.
export async function recordSnapshot(db: Db, snap: IngestSnapshot, nowMs = Date.now()): Promise<RecordResult> {
  const res = await ingestSnapshot(db, snap, { includeSamples: false });
  const ts = snapshotTs(snap);
  const rolledUpRows = await rollupDays(db, utcDay(ts - DAY_MS), utcDay(ts + DAY_MS));
  const prunedRows = await pruneObservations(db, retentionCutoff(nowMs));
  return { ...res, rolledUpRows, prunedRows };
}

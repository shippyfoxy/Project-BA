import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { connectPglite } from "@/lib/db/pglite";
import { applyMigrations } from "@/lib/db/migrate";
import { recordSnapshot } from "@/lib/db/live";
import { loadSnapshotFromDb } from "@/lib/db/read";
import {
  ingestSnapshot,
  pruneObservations,
  rollupDays,
  type IngestGame,
  type IngestSnapshot,
} from "@/lib/db/ingest";

const T0 = Date.parse("2026-06-01T10:00:00Z");
const MIN = 60_000;

function game(over: Partial<IngestGame> = {}): IngestGame {
  return {
    universeId: 100,
    rootPlaceId: 900,
    name: "Test Game",
    creatorName: "Studio",
    genreL1: "Simulation",
    genreL2: "Incremental Simulator",
    created: "2025-01-01T00:00:00Z",
    canonicalUrlPath: "/games/900/Test-Game",
    playing: 1000,
    visits: 50_000,
    favoritedCount: 300,
    upVotes: 90,
    downVotes: 10,
    ...over,
  };
}

function snap(ts: number, games: IngestGame[]): IngestSnapshot {
  return { generatedAt: new Date(ts).toISOString(), generatedAtMs: ts, games };
}

let db: Db;

beforeEach(async () => {
  db = await connectPglite();
  await applyMigrations(db);
});

afterEach(async () => {
  await db.close();
});

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params))[0];

describe("applyMigrations", () => {
  it("is a no-op the second time", async () => {
    expect(await applyMigrations(db)).toEqual([]);
    const r = await one<{ n: number }>("select count(*)::int as n from schema_migrations");
    expect(r.n).toBe(1);
  });
});

describe("Db.transaction", () => {
  it("rolls back every statement when the callback throws", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query("insert into snapshots (ts, game_count, source) values (now(), 1, 'test')");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const r = await one<{ n: number }>("select count(*)::int as n from snapshots");
    expect(r.n).toBe(0);
  });
});

describe("ingestSnapshot", () => {
  it("writes games, one observation per game and a snapshot marker", async () => {
    const res = await ingestSnapshot(db, snap(T0, [game(), game({ universeId: 101, rootPlaceId: 901 })]), {
      gitSha: "abc123",
    });
    expect(res).toMatchObject({ skipped: false, games: 2, observations: 2, droppedInvalid: 0 });

    const obs = await one<{ playing: number; visits: string; favorites: number; up_votes: number }>(
      "select playing, visits::text, favorites, up_votes from observations where universe_id = 100",
    );
    expect(obs).toEqual({ playing: 1000, visits: "50000", favorites: 300, up_votes: 90 });
    const s = await one<{ game_count: number; git_sha: string }>("select game_count, git_sha from snapshots");
    expect(s).toEqual({ game_count: 2, git_sha: "abc123" });
  });

  it("skips a snapshot it has already ingested", async () => {
    await ingestSnapshot(db, snap(T0, [game()]));
    const again = await ingestSnapshot(db, snap(T0, [game({ playing: 5 })]));
    expect(again.skipped).toBe(true);
    const r = await one<{ playing: number }>("select playing from observations");
    expect(r.playing).toBe(1000);
  });

  it("keeps the newest metadata regardless of ingest order", async () => {
    await ingestSnapshot(db, snap(T0, [game({ name: "Middle" })]));
    await ingestSnapshot(db, snap(T0 + 60 * MIN, [game({ name: "Newest" })]));
    await ingestSnapshot(db, snap(T0 - 60 * MIN, [game({ name: "Oldest" })]));
    const g = await one<{ name: string; first_seen: Date; last_seen: Date }>(
      "select name, first_seen, last_seen from games",
    );
    expect(g.name).toBe("Newest");
    expect(new Date(g.first_seen).getTime()).toBe(T0 - 60 * MIN);
    expect(new Date(g.last_seen).getTime()).toBe(T0 + 60 * MIN);
  });

  it("does not blank fields that an older snapshot format lacks", async () => {
    await ingestSnapshot(db, snap(T0, [game({ minimumAge: 9, ageRecommendation: "Maturity: Mild" })]));
    await ingestSnapshot(db, snap(T0 + 30 * MIN, [game({ minimumAge: undefined, ageRecommendation: undefined })]));
    const g = await one<{ minimum_age: number; age_recommendation: string }>(
      "select minimum_age, age_recommendation from games",
    );
    expect(g).toEqual({ minimum_age: 9, age_recommendation: "Maturity: Mild" });
  });

  it("recovers readings from samples and fills votes in when the full reading arrives", async () => {
    const earlier = T0 - 30 * MIN;
    await ingestSnapshot(
      db,
      snap(T0, [game({ samples: [{ ts: earlier, playing: 800, visits: 49_000 }, { ts: T0, playing: 1, visits: 1 }] })]),
      { includeSamples: true },
    );
    const rows = await db.query<{ ts: Date; playing: number; up_votes: number | null }>(
      "select ts, playing, up_votes from observations order by ts",
    );
    // The samples entry at T0 is superseded by the top-level reading.
    expect(rows.map((r) => [new Date(r.ts).getTime(), r.playing, r.up_votes])).toEqual([
      [earlier, 800, null],
      [T0, 1000, 90],
    ]);

    await ingestSnapshot(db, snap(earlier, [game({ playing: 800, visits: 49_000, upVotes: 70 })]));
    const filled = await one<{ up_votes: number }>("select up_votes from observations where ts = $1", [
      new Date(earlier).toISOString(),
    ]);
    expect(filled.up_votes).toBe(70);
  });

  it("drops readings older than minTs", async () => {
    const res = await ingestSnapshot(
      db,
      snap(T0, [game({ samples: [{ ts: T0 - 3 * 86_400_000, playing: 5, visits: 5 }] })]),
      { includeSamples: true, minTs: T0 - 86_400_000 },
    );
    expect(res.observations).toBe(1);
  });

  it("drops malformed games and readings instead of failing the snapshot", async () => {
    const res = await ingestSnapshot(
      db,
      snap(T0, [
        game({ universeId: 0 }),
        game({ universeId: 102, rootPlaceId: 902, playing: Number.NaN }),
        game({ universeId: 103, rootPlaceId: 903, name: "" }),
        game(),
      ]),
    );
    expect(res).toMatchObject({ games: 2, observations: 1, droppedInvalid: 3 });
  });

  it("unions country and device presence within a day", async () => {
    await ingestSnapshot(db, snap(T0, [game({ popularInCountries: ["us", "gb"], popularOnDevices: ["computer"] })]));
    await ingestSnapshot(
      db,
      snap(T0 + 30 * MIN, [game({ popularInCountries: ["br", "us"], popularOnDevices: ["console"] })]),
    );
    const p = await one<{ countries: string[]; devices: string[] }>(
      "select countries, devices from game_presence_daily",
    );
    expect(p).toEqual({ countries: ["br", "gb", "us"], devices: ["computer", "console"] });
  });
});

describe("rollupDays and pruneObservations", () => {
  it("aggregates a UTC day and survives pruning of its raw rows", async () => {
    const day = Date.parse("2026-06-01T00:00:00Z");
    const readings = [
      { at: day + 60 * MIN, playing: 100, visits: 1_000, up: 10 },
      { at: day + 12 * 60 * MIN, playing: 400, visits: 1_600, up: 12 },
      { at: day + 23 * 60 * MIN, playing: 200, visits: 2_000, up: 15 },
      // Next day: must not leak into 2026-06-01.
      { at: day + 25 * 60 * MIN, playing: 999, visits: 2_100, up: 16 },
    ];
    for (const r of readings) {
      await ingestSnapshot(db, snap(r.at, [game({ playing: r.playing, visits: r.visits, upVotes: r.up })]));
    }

    expect(await rollupDays(db, "2026-06-01", "2026-06-03")).toBe(2);
    const d = await one<Record<string, unknown>>(
      `select samples, playing_avg, playing_min, playing_max, playing_max_at,
              visits_first::int, visits_last::int, up_votes_last
       from game_daily where day = '2026-06-01'`,
    );
    expect(d).toMatchObject({
      samples: 3,
      playing_min: 100,
      playing_max: 400,
      visits_first: 1_000,
      visits_last: 2_000,
      up_votes_last: 15,
    });
    expect(d.playing_avg).toBeCloseTo(233.33, 1);
    expect(new Date(d.playing_max_at as string).getTime()).toBe(day + 12 * 60 * MIN);

    expect(await pruneObservations(db, Date.parse("2026-06-02T00:00:00Z"))).toBe(3);
    const left = await one<{ n: number }>("select count(*)::int as n from observations");
    expect(left.n).toBe(1);
    const kept = await one<{ n: number }>("select count(*)::int as n from game_daily");
    expect(kept.n).toBe(2);
  });
});

describe("recordSnapshot", () => {
  it("stores only the live reading, rolls up the day and prunes old raw rows", async () => {
    const old = Date.parse("2026-05-01T12:00:00Z");
    await ingestSnapshot(db, snap(old, [game()]));
    const now = Date.parse("2026-06-01T12:00:00Z");
    const res = await recordSnapshot(
      db,
      snap(now, [game({ samples: [{ ts: now - 30 * MIN, playing: 5, visits: 5 }] })]),
      now,
    );
    expect(res).toMatchObject({ skipped: false, observations: 1, rolledUpRows: 1, prunedRows: 1 });
    const daily = await one<{ day: string }>("select day::text from game_daily");
    expect(daily.day).toBe("2026-06-01");
    expect((await recordSnapshot(db, snap(now, [game()]), now)).skipped).toBe(true);
  });
});

describe("loadSnapshotFromDb", () => {
  it("returns null for an empty database", async () => {
    expect(await loadSnapshotFromDb(db)).toBeNull();
  });

  it("rebuilds the latest snapshot with history as samples", async () => {
    await ingestSnapshot(db, snap(T0, [game({ playing: 900, visits: 49_000 })]));
    await ingestSnapshot(
      db,
      snap(T0 + 30 * MIN, [
        game({ minimumAge: 9, ageRecommendation: "Maturity: Mild", popularInCountries: ["us"], popularOnDevices: ["computer"] }),
        game({ universeId: 101, rootPlaceId: 901, name: "Second" }),
      ]),
    );
    const s = await loadSnapshotFromDb(db);
    expect(s?.generatedAtMs).toBe(T0 + 30 * MIN);
    expect(s?.games).toHaveLength(2);
    const g = s!.games.find((x) => x.universeId === 100)!;
    expect(g).toMatchObject({
      rootPlaceId: 900,
      name: "Test Game",
      genreL1: "Simulation",
      playing: 1000,
      visits: 50_000,
      favoritedCount: 300,
      upVotes: 90,
      minimumAge: 9,
      ageRecommendation: "Maturity: Mild",
      popularInCountries: ["us"],
      popularOnDevices: ["computer"],
      created: "2025-01-01T00:00:00.000Z",
    });
    expect(g.samples).toEqual([
      { ts: T0, playing: 900, visits: 49_000 },
      { ts: T0 + 30 * MIN, playing: 1000, visits: 50_000 },
    ]);
    expect(typeof g.universeId).toBe("number");
  });
});

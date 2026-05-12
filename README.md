# Roblox Pulse

A single-page analytics dashboard exploring Roblox discovery data through two
proxy lenses:

1. **Estimated retention by genre** — derived from like-ratio, favourites, and
   the ratio of current concurrent players to historical visit volume.
2. **Estimated session-length cohorts** — derived from concurrent players
   divided by visit velocity over the window between two snapshots.

Both metrics are *proxies*, not ground-truth telemetry. Read
`/methodology` (or [`app/methodology/page.tsx`](app/methodology/page.tsx)) for
the formulas, assumptions, and what they don't measure.

> Live demo: <https://pulse.shipfox.me>

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript strict
- Tailwind v4 + shadcn/ui (slate)
- Recharts for charts
- Vitest for unit tests
- No database — `data/snapshots/latest.json` is committed and read at request time

## Running it

```bash
pnpm install
pnpm refresh-data        # pulls live data into data/snapshots/latest.json
pnpm refresh-data        # run a second time a few minutes later to populate cohorts
pnpm dev
```

Open <http://localhost:3000>.

## Data flow

```
explore-api/v1/get-sorts (~230 universeIds, no auth)
        |
        v
games.roblox.com/v1/games?universeIds=...     (50 IDs/batch)
games.roblox.com/v1/games/votes?universeIds=. (50 IDs/batch)
        |
        v
data/snapshots/latest.json   (committed; appends a (ts, playing, visits) sample per refresh)
        |
        v
Server Components render KPIs / genre chart / cohort chart / top-games table
```

The dashboard never calls the Roblox API at request time — it reads the
snapshot file. The deployed site stays fast and works on cold start
regardless of Roblox's availability or rate-limit posture.

## Refreshing

Each `pnpm refresh-data` run:

- Fetches the discovery sorts to get a seed list of universeIds.
- Enriches them in batches of 50 against `/v1/games` and `/v1/games/votes`.
- Appends a `{ts, playing, visits}` sample to each game's rolling history
  (last 12 samples kept).
- Writes `data/snapshots/latest.json` atomically.

The session-length cohort chart needs at least two refreshes spaced a few
minutes apart so visit velocity can be computed.

## Testing

```bash
pnpm test          # runs Vitest once
pnpm test:watch    # watch mode
```

The metrics module is fully unit-tested (`tests/metrics.test.ts`). 17 tests
cover the retention proxy, session-minute estimator, and bucket mapping —
including malformed input, divide-by-zero, and reverse-time guards.

## Project layout

```
app/
  page.tsx                  dashboard
  methodology/page.tsx      proxy explanations
  layout.tsx                shared header + footer
components/
  ui/                       shadcn/ui primitives
  dashboard/                KpiStrip, GenreRetentionChart, SessionCohortChart, TopGamesTable, ClientOnly
lib/
  metrics.ts                pure proxy functions
  roblox/
    client.ts               typed, rate-limited, retrying API client
    types.ts                wire-format types
  snapshot/
    schema.ts               Snapshot / SnapshotGame / SnapshotSample types
    loader.ts               mtime-cached loader
    aggregate.ts            chart-row computations
scripts/
  refresh-data.ts           pnpm refresh-data
data/
  snapshots/latest.json     committed fallback
tests/
  metrics.test.ts           Vitest
```

## Notes on the data

- The `/v1/games` endpoint returns *only* accessible universes — private and
  deleted games drop out of the response silently. The client tolerates a
  shorter response than the input ID list.
- `genre_l1` is the modern taxonomy (e.g. "Roleplay & Avatar Sim", "Combat",
  "Sports & Racing"); the legacy `genre` field is kept around for back-compat
  but isn't used. Bookkeeping buckets ("All", "Education", "Entertainment",
  "Shopping", "Social") are filtered out of the genre chart because they
  aren't actually playstyle categories.
- The discovery seed comes from currently-popular sorts, so the dataset is
  biased towards games that already have momentum. The methodology page
  spells this out.

## Deploy

Vercel — `pnpm build` runs cleanly with Turbopack. Pre-rendering is fine
because the page reads from a committed JSON file. Schedule a daily GitHub
Action calling `pnpm refresh-data && git commit && git push` to keep the
snapshot fresh.

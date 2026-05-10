import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Methodology — Roblox Pulse",
  description:
    "How the retention and session-length proxies are computed, what they don't measure, and the limitations of inferring engagement from public Roblox data.",
};

export default function MethodologyPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
          &larr; back to dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Methodology</h1>
        <p className="text-sm text-muted-foreground">
          Roblox Pulse infers engagement signals from public, keyless Roblox
          endpoints. Both headline metrics are <strong>proxies</strong>, not
          ground-truth retention or session length. Treat them as smell tests,
          not as substitutes for in-game telemetry.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Retention proxy (v2)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
{`retentionProxy =
    (upVotes / (upVotes + downVotes))
  × log10(favoritedCount + 1)
  × log10(playing + 1)`}
          </pre>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <strong>Like-ratio</strong> rewards games with positive
              reception. Returns 0 when a game has no votes (e.g. brand-new
              releases).
            </li>
            <li>
              <strong>log10(favourites + 1)</strong> measures depth of
              fandom on a log scale — the difference between 100 and 1,000
              favourites matters more than between 10M and 100M.
            </li>
            <li>
              <strong>log10(playing + 1)</strong> measures current concurrent
              engagement, also log-scaled so a 600k-player giant doesn&rsquo;t
              completely drown out a 5k-player niche darling.
            </li>
          </ul>
          <p className="text-muted-foreground">
            <strong>Why v2:</strong> the v1 formula divided by{" "}
            <code>visits / 24</code>, which collapsed established games like
            Brookhaven (82B lifetime visits) to a near-zero score —
            backwards from the business meaning of retention. v2 drops the
            visits-as-denominator term entirely and rewards
            quality × fandom × current activity. Lifetime visits no longer
            penalise the score; if anything, they correlate with all three
            terms going up.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session-length proxy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
{`estimatedSessionMinutes =
    later.playing / ((later.visits - earlier.visits) / intervalMinutes)`}
          </pre>
          <p className="text-muted-foreground">
            Two snapshots of <code>playing</code> and <code>visits</code> taken
            at different times let us compute visit velocity (visits per
            minute). Dividing concurrency by that velocity yields an estimated
            average session in minutes &mdash; under the assumption that, in
            steady state, average concurrent players ≈ session-length × arrival
            rate (Little&rsquo;s law).
          </p>
          <p className="text-muted-foreground">
            Buckets: <code>&lt;5m</code>, <code>5&ndash;15m</code>, <code>15&ndash;30m</code>, <code>30m+</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What this doesn&rsquo;t measure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>True retention.</strong> D1/D7/D30 retention requires
              per-user data Roblox doesn&rsquo;t expose publicly.
            </li>
            <li>
              <strong>True session length.</strong> The proxy assumes steady
              state; live events, server outages and time-of-day swings will
              skew it.
            </li>
            <li>
              <strong>Bots and idle servers.</strong> <code>playing</code> includes
              AFK accounts and bots. There is no public way to net these out.
            </li>
            <li>
              <strong>Game age.</strong> Lifetime visits are heavily biased
              towards older games; the visit-velocity normalisation in the
              retention proxy partially &mdash; but not fully &mdash; corrects
              for this.
            </li>
            <li>
              <strong>Discovery sampling bias.</strong> Seeds come from the
              <code> explore-api</code> sorts (Top Trending, Top Playing Now,
              etc.), so the dataset over-represents currently-popular games.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sources & refresh cadence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>Discovery seed:</strong> <code>apis.roblox.com/explore-api/v1/get-sorts</code> &mdash; ~230 unique
            universes per call across five sort rails.
          </p>
          <p>
            <strong>Game enrichment:</strong> <code>games.roblox.com/v1/games?universeIds=…</code> (50 IDs per batch).
          </p>
          <p>
            <strong>Votes:</strong> <code>games.roblox.com/v1/games/votes?universeIds=…</code> (50 IDs per batch).
          </p>
          <p>
            Run <code className="rounded bg-muted px-1 py-0.5">pnpm refresh-data</code> to regenerate the snapshot. Each
            refresh appends a <code>(ts, playing, visits)</code> sample per game; the cohort proxy uses the most recent
            two samples.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

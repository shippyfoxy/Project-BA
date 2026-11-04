import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Methodology — Roblox Pulse",
  description:
    "How the appeal score and session-length proxy are computed, what they don't measure, and the limitations of inferring engagement from public Roblox data.",
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
          <CardTitle>Appeal score (v2, formerly the retention proxy)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
{`appealScore =
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
            <strong>Why the name:</strong> this measures how well liked and
            popular a game is right now. It cannot measure whether players come
            back, so it was renamed from &ldquo;retention proxy&rdquo; to avoid
            being read as D1 or D7 retention.
          </p>
          <p className="text-muted-foreground">
            <strong>Why v2:</strong> the v1 formula divided by{" "}
            <code>visits / 24</code>, which collapsed established games like
            Brookhaven (82B lifetime visits) to a near-zero score. v2 drops the
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

      <Card id="revenue" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Estimated revenue (modelled from Top Earning rank)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            <strong>What is measured:</strong> each refresh records every game&rsquo;s position in Roblox&rsquo;s public{" "}
            <a href="https://www.roblox.com/charts/top-earning" className="underline">
              Top Earning
            </a>{" "}
            list (computer, all locations), which Roblox describes as sorted by total Robux spent in the last 7 days. About 460 games are
            listed. Roblox leaves a few entries out of each page, so a rank is the position in the public list, not necessarily the
            internal one. Recording started on 3 November 2026.
          </p>
          <p className="text-muted-foreground">
            <strong>What is modelled:</strong> Roblox publishes the order, never the amounts. The estimate turns a rank into a monthly
            creator payout (DevEx, in US dollars) with a power law:
          </p>
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
{`monthly DevEx (USD) = 13.26M × rank^-1.041
rank used           = the effective rank over the last 7 lists
range shown         = 0.7× the rank below to 1.5× the rank above`}
          </pre>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              Rank 1 ≈ $13M a month, rank 10 ≈ $1.2M, rank 50 ≈ $230k, rank 100 ≈ $110k, rank 200 ≈ $53k, rank 464 ≈ $22k.
            </li>
            <li>
              The curve is fitted to Roblox&rsquo;s RDC 2026 payout tiers for the year to 30 June 2026 (the top 10 creators averaged
              $65.7M, the top 100 $10.8M, the top 1,000 $1.4M, and creators earned $1.7B through DevEx in all) and the standard DevEx rate
              of $0.0038 per Robux. Players&rsquo; spend is roughly the payout ÷ $0.0038 ÷ 0.7, since creators keep about 70%.
            </li>
            <li>
              The tiers are per creator and the curve is per game, so it reads low at the very top: the ten highest-ranked games add up to
              about $455M a year against $657M for the top ten creators, who often own several hits.
            </li>
            <li>
              The curve is steep at the top: rank 1 is estimated at twice rank 2. Neighbours often earn about the same, so a game that
              swaps places with its neighbour would see its estimate halve or double overnight. Estimates therefore use the game&rsquo;s
              effective rank over the last 7 recorded lists (the rank whose estimate is the mean of its daily estimates; a day off the list
              counts as the rank just below it), and the range runs from the rank below to the rank above, so neighbours&rsquo; ranges
              overlap. The rank column itself is always the latest list. Day-by-day exports use each day&rsquo;s own rank.
            </li>
          </ul>
          <p className="text-muted-foreground">
            <strong>Treat it as an order of magnitude.</strong> Event weeks (Halloween, holidays) lift ranks; Robux from age-checked US
            adults has paid 42% more since 8 June 2026, which shifts what a rank is worth; and the list is per device, so a game whose spend
            is mostly on phones can rank lower here than its real total. Games outside the list are not estimated at all.
          </p>
          <p className="text-muted-foreground">
            Sources: Roblox RDC 2026 creator payouts as reported by{" "}
            <a href="https://www.dexerto.com/roblox/robloxs-top-creators-average-65-7-million-a-year-but-most-make-far-less-3408675/" className="underline">
              Dexerto
            </a>{" "}
            and{" "}
            <a href="https://www.ibtimes.co.uk/roblox-top-creators-devex-payouts-2026-1819403" className="underline">
              IBTimes
            </a>
            ; the DevEx rate change in Roblox&rsquo;s{" "}
            <a href="https://www.sec.gov/Archives/edgar/data/0001315098/000162828026051082/rblx-20260630.htm" className="underline">
              Q2 2026 10-Q
            </a>
            . The curve follows an independent revenue study shared with us, checked here against those tiers.
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
              <strong>Game age.</strong> Favourites are lifetime totals, so
              older games score higher on the appeal score; the log scale
              softens this but does not remove it.
            </li>
            <li>
              <strong>Discovery sampling bias.</strong> Games are found
              through the <code> explore-api</code> sorts (Top Trending, Top
              Playing Now, etc.). Since 25 October 2026 every game found there
              is re-read on each refresh, but a game that never reaches those
              lists is never tracked.
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

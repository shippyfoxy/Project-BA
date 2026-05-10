import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Results — Roblox Pulse",
  description:
    "Executive summary: what the dashboard tells you, who acts on it, and the limits to keep in mind.",
};

export default function ResultsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
          &larr; back to dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Executive summary</h1>
        <p className="text-sm text-muted-foreground">
          A one-page read on what the dashboard surfaces, who would act on it,
          and where the numbers stop being trustworthy. Written for product,
          marketing and investment leads — the formulas live on the{" "}
          <Link href="/methodology" className="underline hover:text-foreground">methodology</Link> page.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>What this dashboard answers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p className="text-foreground">
            Three questions, side-by-side, refreshed hourly:
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Where is engagement strongest?</strong>{" "}
              The genre × age-rating table ranks combinations by retention
              quality and average session length, so you can see which
              audience is sticking around — not just which audience is
              biggest.
            </li>
            <li>
              <strong className="text-foreground">Which regions matter for which content?</strong>{" "}
              The regional breakdown shows the games Roblox is actively
              promoting in each major market and the dominant genre per
              country. Useful for localisation, marketing spend and release
              timing decisions.
            </li>
            <li>
              <strong className="text-foreground">Who is winning right now, and who is winning quietly?</strong>{" "}
              Two leaderboards run in parallel — raw concurrent players and
              retention quality. Games that rank high on both are entrenched
              leaders; games that rank high on quality but modest on size
              are the ones competitive teams should be watching.
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How each role uses this</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold text-foreground">Studio &amp; product leads</h3>
            <p className="text-muted-foreground">
              Use the genre × age table to validate where to invest next. If
              your title sits in a combination with weak retention but high
              concurrency, you are buying attention — not earning it. Pivot
              the design brief towards combinations that score well on both.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Marketing &amp; user acquisition</h3>
            <p className="text-muted-foreground">
              The regional table tells you where each genre over- and
              under-indexes. If your game is a Survival title, the rows where
              Survival is the top genre are your highest-conversion markets;
              the rows where it isn&rsquo;t are either expansion opportunities or
              graveyard spend, and the retention column tells you which.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Publishers &amp; investors</h3>
            <p className="text-muted-foreground">
              The two leaderboards form a quick screening 2×2: high players +
              high retention is an entrenched leader (defensible asset);
              high players + low retention is a churn risk priced as a hit;
              low players + high retention is an under-marketed sleeper
              (acquisition target). Triage at a glance, then go deep on the
              names that catch the eye.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Indie devs validating an idea</h3>
            <p className="text-muted-foreground">
              Before committing months to a concept, look at how existing
              titles in the same genre × age combination are performing. A
              category clustered at the bottom of the retention table is
              telling you about its ceiling, not just its floor.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the numbers don&rsquo;t say</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-foreground">Retention here is an estimate, not a true cohort metric.</strong>{" "}
              Roblox doesn&rsquo;t expose per-user data, so we infer engagement
              from public signals (likes, favourites, current players,
              lifetime visits). It&rsquo;s a directional smell test — directional
              enough to make decisions on, not precise enough to set targets
              by.
            </li>
            <li>
              <strong className="text-foreground">The dataset over-represents currently popular games.</strong>{" "}
              We seed from Roblox&rsquo;s discovery surface, so anything Roblox
              isn&rsquo;t actively promoting is invisible. Long-tail and niche
              titles aren&rsquo;t in the picture.
            </li>
            <li>
              <strong className="text-foreground">Older games look bigger than they should.</strong>{" "}
              Lifetime visits accumulate forever; a six-year-old game will
              always look weightier than a six-month-old one growing twice
              as fast.
            </li>
            <li>
              <strong className="text-foreground">Bots and AFK accounts are inside the player counts.</strong>{" "}
              Some of what looks like engagement on certain titles is actually
              farming or idling; there is no public way to net it out.
            </li>
            <li>
              <strong className="text-foreground">Snapshots, not live.</strong>{" "}
              Refresh runs hourly at best because of platform rate limits.
              Live events and time-of-day spikes between snapshots are
              invisible.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where this can go next</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-foreground">Trend lines per game.</strong>{" "}
              The pipeline already stores hourly readings; surfacing a
              12-hour mini-chart per top-N game would make momentum visible
              alongside position.
            </li>
            <li>
              <strong className="text-foreground">Genre-relative ranking.</strong>{" "}
              A game&rsquo;s absolute score says little; its rank inside its own
              genre and age bucket says a lot — especially for benchmarking.
            </li>
            <li>
              <strong className="text-foreground">Outlier alerts.</strong>{" "}
              Flag titles that score well above their genre mean, or that
              jump in concurrency week-on-week. That&rsquo;s where the
              acquisition and competitive-intel use cases would land
              first.
            </li>
            <li>
              <strong className="text-foreground">More markets in the regional view.</strong>{" "}
              Adding mid-tier markets (MX, IN, FR, TR, ID) deepens the
              localisation story without meaningfully more cost.
            </li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}

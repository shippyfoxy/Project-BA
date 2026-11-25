import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { MAX_START_AGE_DAYS } from "@/lib/trends/launches";
import { MIN_BADGE_AGE_DAYS } from "@/lib/trends/welcome";

export const metadata: Metadata = {
  title: "How we measure: Roblox Pulse",
  description:
    "Where Roblox Pulse's numbers come from, how each one is calculated, and what public Roblox data can't tell you.",
};

const SECTIONS: [string, string][] = [
  ["collection", "How data is collected"],
  ["players", "Players, weeks and peaks"],
  ["stages", "Lifecycle stages"],
  ["sessions", "Session length"],
  ["new-players", "New and returning players"],
  ["launches", "Launch curves"],
  ["updates", "Update impact"],
  ["ideas", "Name patterns and momentum"],
  ["revenue", "Estimated revenue"],
  ["limits", "What this can't tell you"],
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-6 flex-col gap-3">
      <h2 id={`${id}-h`} className="font-heading text-[26px] font-bold tracking-[-0.02em]">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-text-2">{children}</div>
    </section>
  );
}

function Formula({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-xl border border-border bg-card px-4 py-3 font-mono text-[13px] text-foreground">{children}</pre>;
}

export default function MethodologyPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-16 pt-9 md:px-6 lg:flex-row lg:items-start">
      <nav aria-label="On this page" className="flex flex-col gap-1 text-sm lg:sticky lg:top-6 lg:w-56 lg:shrink-0">
        <span className="mb-1 text-[13px] font-semibold text-muted-foreground">On this page</span>
        <span className="flex flex-wrap gap-x-4 gap-y-1 lg:flex-col">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-text-2 hover:text-foreground">
              {label}
            </a>
          ))}
        </span>
      </nav>

      <div className="flex min-w-0 max-w-3xl flex-col gap-10">
        <header className="flex flex-col gap-3">
          <h1 className="font-heading text-[clamp(36px,6vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em]">How we measure</h1>
          <p className="text-base text-text-2">
            Every number here comes from Roblox&apos;s public, keyless APIs. Some are counted directly; others, like session length and
            revenue, are estimates built from them. This page says which is which, how each is worked out, and where it falls short.
          </p>
        </header>

        <Section id="collection" title="How data is collected">
          <p>
            Every hour, Roblox Pulse reads Roblox&apos;s discovery lists (Top Trending, Up-and-Coming, Top Playing Now and the rest) for 24
            countries and 5 device types, then reads every game it has ever found there: current players, lifetime visits, favourites, likes
            and when it was last updated. Games with no players for 30 days are read once a day instead of hourly.
          </p>
          <p>
            Until 24 October 2026 only games currently in those lists were read, so a game that dropped out simply stopped being recorded.
            Since 25 October every known game is read, which raised totals by about a quarter. Charts that span that date mark it with a
            dashed line, and figures that compare weeks only use weeks after it.
          </p>
          <p>
            Raw readings are kept for 3 days and rolled up into one row per game per day (average, lowest and highest players, visits,
            favourites and votes), which is what history, exports and the API serve.
          </p>
        </Section>

        <Section id="players" title="Players, weeks and peaks">
          <p>
            A game&apos;s <strong className="text-foreground">7-day average</strong> is the mean of its daily averages over the last 7
            complete UTC days; today is still filling in, so it is left out. Week on week compares that with the 7 days before.
          </p>
          <p>
            A game&apos;s <strong className="text-foreground">best week</strong> is its highest 7-day average, counting only windows with
            readings on at least 5 of the 7 days, so a single busy day can&apos;t set it. Benchmarks rank a game among others in its genre
            with 1,000+ players by percentile, so a few giants don&apos;t distort the middle.
          </p>
        </Section>

        <Section id="stages" title="Lifecycle stages">
          <p>Only games averaging 1,000+ players get a stage. The first rule that matches wins:</p>
          <Formula>{`Breakout   created in the last 30 days and 10,000+ players
Rising     this week at least 1.25× last week
Peaking    this week at least 90% of its best week
Fading     this week at most half its best week
Cooling    below last week
Evergreen  tracked for 120+ days
Steady     everything else`}</Formula>
        </Section>

        <Section id="sessions" title="Session length">
          <p>
            Roblox doesn&apos;t publish session length, so it is estimated with Little&apos;s law: on average, the players in a game at
            once equal how often people arrive times how long they stay.
          </p>
          <Formula>{`session (minutes) = average players ÷ new visits per minute
new visits per minute = visits gained between the last readings of
                        consecutive days ÷ the minutes between them`}</Formula>
          <p>
            Both are taken over the last 7 complete days. Estimates under half a minute or over 10 hours are dropped as noise. A visit is
            every join, including rejoins after a crash or a server hop, so this reads lower than a per-player session, and it assumes the
            game is neither growing nor shrinking fast. Use it to compare games with each other, not as a measured figure.
          </p>
        </Section>

        <Section id="new-players" title="New and returning players">
          <p>
            Most games award a Welcome badge on a player&apos;s first visit, and Roblox publishes how many times each badge was awarded in
            the past 24 hours. Once a day, for games averaging 1,000+ players, that count is set against the game&apos;s visits over the
            same 24 hours:
          </p>
          <Formula>{`share of joins by new players = Welcome badges awarded in 24 hours
                                ÷ visits in the same 24 hours`}</Formula>
          <p>
            Badges for returning players (&ldquo;Welcome back&rdquo;) are left out, as are badges added more than a week after a game
            launched and less than {MIN_BADGE_AGE_DAYS} days ago, since existing players earn those too. A share above 100% means the badge
            isn&apos;t a first-join badge, and the game is skipped. About 1 game in 6 has a usable badge.
          </p>
        </Section>

        <Section id="launches" title="Launch curves">
          <p>
            Day 0 is the first day a game reached the discovery lists, not the day it was created: studios often create a game months
            before they publish it. Games count if they were created since 8 May 2026 and reached the lists within {MAX_START_AGE_DAYS} days.
            Each day of the curve uses only dates from 25 October, when a day with no reading started to mean zero players, so launches that
            faded are never dropped.
          </p>
          <p>
            This is the bar for <strong className="text-foreground">launches that broke through</strong> into the discovery lists, which is
            much higher than for every new game on Roblox: most never reach the lists at all.
          </p>
        </Section>

        <Section id="updates" title="Update impact">
          <p>
            A <strong className="text-foreground">publish</strong> is any change to Roblox&apos;s &ldquo;last updated&rdquo; time, small
            fixes included. An <strong className="text-foreground">announced update</strong> is a new tag in the title, such as
            &ldquo;[UPD 21]&rdquo;; countdowns like &ldquo;[8H⏳]&rdquo; don&apos;t count.
          </p>
          <Formula>{`change = average players on days +1 and +2
         ÷ the same two weekdays a week earlier − 1`}</Formula>
          <p>
            Comparing with the same weekdays cancels out the weekend rhythm. Only games averaging 1,000+ players count, and both days on each
            side must be complete, so a result appears three days after an update.
          </p>
        </Section>

        <Section id="ideas" title="Name patterns and momentum">
          <p>
            Game names are split into words and pairs of words, with tags and emoji removed. A pattern needs at least 5 games averaging
            100+ players. Its players are added up across every game using it; patterns found in nearly the same games are merged into the
            most specific one.
          </p>
          <Formula>{`against market = this pattern's change on last week
                 − the change for every tracked game
rising    10+ points ahead of the market
fading    10+ points behind it
crowding  new games arriving 1.5× faster than across every
          game, against the month before, with players not rising`}</Formula>
          <p>
            New games are those that first reached the lists in the last 30 days within {MAX_START_AGE_DAYS} days of being created; a hit
            averages 1,000+ players this week.
          </p>
        </Section>

        <Section id="revenue" title="Estimated revenue">
          <p>
            <strong className="text-foreground">Measured:</strong> every refresh records each game&apos;s position in Roblox&apos;s public{" "}
            <a href="https://www.roblox.com/charts/top-earning" className="text-link underline">
              Top Earning
            </a>{" "}
            list (computer, all locations), which Roblox sorts by Robux spent in the last 7 days. About 460 to 560 games are listed, depending on the day. Recording
            started on 3 November 2026.
          </p>
          <p>
            <strong className="text-foreground">Modelled:</strong> Roblox publishes the order, never the amounts. A rank becomes a monthly
            creator payout (DevEx, in US dollars) with a power law fitted to Roblox&apos;s RDC 2026 payout tiers (top 10 creators averaged
            $65.7M a year, top 100 $10.8M, top 1,000 $1.4M, $1.7B in all) and the DevEx rate of $0.0038 per Robux:
          </p>
          <Formula>{`monthly DevEx (USD) = 13.26M × rank^-1.041
rank used           = the effective rank over up to the last 7 lists
range shown         = 0.7× the rank below to 1.5× the rank above`}</Formula>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>Rank 1 ≈ $13M a month, rank 10 ≈ $1.2M, rank 100 ≈ $110k, rank 460 ≈ $22k.</li>
            <li>
              The curve is steep at the top, so neighbours swapping places would halve or double an estimate overnight. Each estimate
              therefore averages the game&apos;s daily estimates over up to the last 7 lists, and ranges overlap with the ranks either side.
              Until 7 lists exist, it averages the ones that do.
            </li>
            <li>
              The tiers are per creator and the curve per game, so it reads low at the very top. The list is for computers, so a game whose
              players mostly spend on phones can rank lower than its real total.
            </li>
          </ul>
          <p>
            Treat it as an order of magnitude. Sources: RDC 2026 payouts as reported by{" "}
            <a href="https://www.dexerto.com/roblox/robloxs-top-creators-average-65-7-million-a-year-but-most-make-far-less-3408675/" className="text-link underline">
              Dexerto
            </a>{" "}
            and{" "}
            <a href="https://www.ibtimes.co.uk/roblox-top-creators-devex-payouts-2026-1819403" className="text-link underline">
              IBTimes
            </a>
            ; the DevEx rate in Roblox&apos;s{" "}
            <a href="https://www.sec.gov/Archives/edgar/data/0001315098/000162828026051082/rblx-20260630.htm" className="text-link underline">
              Q2 2026 10-Q
            </a>
            .
          </p>
          <h3 id="lifetime" className="mt-2 scroll-mt-6 font-heading text-lg font-bold text-foreground">
            Lifetime revenue
          </h3>
          <p>
            Game and studio pages add up a game&apos;s estimated revenue month by month from its first reading: from its Top Earning rank on
            days it is listed; before that, from its players times what it earns per player on its ranked days; and for a game never listed,
            from its players times what similar listed games earn per player. Using a game&apos;s own rate matters: Adopt Me! earns about $7 a
            month per player by its rank against a listed median near $12, and pricing its earlier months at the median had tripled them.
            This covers only the time we have tracked it, from May 2026 at the earliest.
          </p>
          <p>
            For the time before, the one public measure that reaches back to launch is lifetime visits. The lifetime figure divides the tracked
            total by the share of lifetime visits that happened while we tracked the game:
          </p>
          <Formula>{`lifetime revenue = tracked revenue ÷ (visits while tracked ÷ lifetime visits)`}</Formula>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              It assumes a visit before tracking earned what a visit earns now. Spending habits, Robux prices, the game&apos;s own shop and the
              DevEx rate (raised from $0.0035 to $0.0038 in September 2025) have all changed over the years, so this is rough. It reads low
              for a hit that earned more per visit at its height than it does now: Grow a Garden, which trackers put above 20 million players
              at once in 2025, comes out near $56M because each visit today earns far less than one did then. It reads high for a game that
              earns more per visit now than it used to.
            </li>
            <li>
              Each page shows the tracked share. For a game made since May 2026 it is close to all of its visits and the figure is as good
              as the monthly estimates; for an older game such as Adopt Me! it can be a few per cent, and the page marks the figure as mostly
              extrapolated. Its range carries only the monthly model&apos;s uncertainty, not the extrapolation&apos;s, so the real uncertainty
              is wider than shown.
            </li>
            <li>Visits count every join, so a game played in short sessions earns less per visit than one played in long ones.</li>
          </ul>
          <h3 id="payouts-2026" className="mt-2 scroll-mt-6 font-heading text-lg font-bold text-foreground">
            Changes to how creators are paid
          </h3>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong className="text-foreground">The US 18+ rate.</strong> Since 8 June 2026, Robux spent by age-checked US players aged 18
              and over pays $0.0054 per Robux instead of $0.0038, in games that use R15 avatars or show no characters. It covers game passes,
              developer products, subscriptions, private servers and, since 21 September, paid access (
              <a href="https://devforum.roblox.com/t/introducing-the-us-18-devex-rate-earn-42-more-on-spend-from-18-us-players/4607091" className="text-link underline">
                Roblox DevForum
              </a>
              ). The model uses $0.0038 throughout, so it reads somewhat low for games with many US adult players.
            </li>
            <li>
              <strong className="text-foreground">Creator Rewards.</strong> Payouts based on Premium members&apos; playtime ended in July
              2025. Creator Rewards replaced them: 5 Robux a day for each player who has spent $9.99 or more in the last 60 days and plays a
              game for 10 minutes (one of their first three games that day), plus 35% of new or returning players&apos; first $100 of
              purchases (
              <a href="https://create.roblox.com/docs/creator-rewards" className="text-link underline">
                Creator Docs
              </a>
              ). Roblox doesn&apos;t say how many of a game&apos;s players qualify. These rewards are not Robux spent in the game, so the Top
              Earning list probably doesn&apos;t count them, while the payout totals the curve was fitted to do.
            </li>
            <li>
              <strong className="text-foreground">Roblox Wallet.</strong> From December 2026, US creators aged 18+ who are sole traders can opt
              in to automatic payouts in dollars every business day, after a hold of up to 30 days; Roblox plans to move away from DevEx in the
              US in mid-2027 (
              <a href="https://devforum.roblox.com/t/introducing-roblox-wallet-and-card-get-paid-faster/4865505" className="text-link underline">
                Roblox DevForum
              </a>
              ). This changes when creators are paid, not how much, so the estimates are unaffected.
            </li>
          </ul>
          <h3 id="revenue-checks" className="mt-2 font-heading text-lg font-bold text-foreground">
            Checks against published numbers
          </h3>
          <p>
            Almost no Roblox game publishes its earnings, so there is little to check the model against. As of November 2026 the formula is
            unchanged; this is what the few public figures say:
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong className="text-foreground">Welcome to Bloxburg, the one company-reported figure.</strong> Its owner Coffee Stain reported
              about SEK 20M ($2.1M) of Bloxburg sales for April to June 2026, about $0.7M a month (
              <a href="https://wnhub.io/news/finance/item-51670" className="text-link underline">
                WN Hub
              </a>
              ), and SEK 19M (about $2M, $0.67M a month) for July to September 2026, down from SEK 25M a year earlier (
              <a href="https://coffeestain.com/wp-content/uploads/coffee-stain-group-interim-report-q2-26-27.pdf" className="text-link underline">
                Coffee Stain Q2 report
              </a>
              ). At its Top Earning rank now the model gives about $270k a month: it reads low for Bloxburg by about 2.5 times. Bloxburg
              charges to enter, which may earn more per player than most games. Since launch the model gives about $100M, while an investor
              account (not Embracer itself) cites SEK 388.7M, about $37M, of revenue in its 18-month 2021/22 year alone, so its lifetime reads
              low too. One game is too few to recalibrate on, so read every estimate as possibly low by that much.
            </li>
            <li>
              <strong className="text-foreground">Blue Lock: Rivals.</strong> Its creator told Bloomberg it took about $5M a month in player
              purchases in 2024 with over a million players at its peak: about $1 of payout per peak player, or roughly $2 to $4 per average
              player. The model gives it about $3.40 per average player now, at a much smaller size (
              <a href="https://www.thestar.com.my/tech/tech-news/2025/07/14/roblox-game-buying-frenzy-is-turning-teens-into-millionaires" className="text-link underline">
                Bloomberg via The Star
              </a>
              ).
            </li>
            <li>
              <strong className="text-foreground">The whole platform, a consistency check only.</strong> Roblox paid creators $403M through
              DevEx in Q3 2026, about $134M a month, for every experience and avatar item (
              <a href="https://www.sec.gov/Archives/edgar/data/0001315098/000162828026068253/rblx-20260930.htm" className="text-link underline">
                Q3 2026 10-Q
              </a>
              ). The model puts the games in the Top Earning list, about 460 to 560 depending on the day, at about $80M a month. That fits, but it is not an
              independent test: the curve was fitted to Roblox&apos;s own creator payout totals.
            </li>
            <li>
              <strong className="text-foreground">Adopt Me! over its life.</strong> Uplift Games has never published a dollar figure, only
              that revenue rose over 400% in 2020 (
              <a href="https://gamesbeat.com/roblox-virtual-pet-adoption-creators-start-their-own-studio-uplift-games/" className="text-link underline">
                GamesBeat
              </a>
              ). Outside estimates put its payout at its height at $50M to $77M a year (Dubit;{" "}
              <a href="https://www.gameeconomistconsulting.com/robloxs-battlebit-failure-adopt-me-ripoff/" className="text-link underline">
                Game Economist Consulting
              </a>
              , 2023). The model
              gives about $13M a year now and $160M to $450M since 2017, which fits a few years near those levels and a long decline since.
            </li>
            <li>
              <strong className="text-foreground">Phone-heavy games.</strong> David Taylor estimated Brookhaven RP at about $18M a year in
              early 2025 (
              <a href="https://newsletter.seg3.com/p/voldex-acquires-roblox-s-most-visited-game-brookhaven-ugc-game-marketing-ramdam-klarna-crypto" className="text-link underline">
                SEG3
              </a>
              ); at its rank today the model gives a few million. Some of that is decline, but the Top Earning list we read is the
              computer one, so games played mostly on phones, like Brookhaven and Adopt Me!, probably read low.
            </li>
            <li>
              <strong className="text-foreground">What developers say they personally make.</strong> Fisch&apos;s developer says he makes
              about $400k a month including toy licensing; the model gives the game about $1M a month, shared across its team. Neither
              contradicts the other.
            </li>
            <li>
              <strong className="text-foreground">The top of the list.</strong> Roblox paid creators about $1.7B through DevEx in the year to
              June 2026 (
              <a href="https://about.roblox.com/newsroom/2026/09/global-impact-of-creation-on-roblox" className="text-link underline">
                Roblox
              </a>
              ); the top 10 creators averaged a reported $65.7M each, across all their games. The model&apos;s top 10 games average about $43M a year, with RIVALS alone near $160M:
              high but possible for the single biggest earner.
            </li>
            <li>
              <strong className="text-foreground">Per player.</strong> Across the platform creators earn about $9 a month per average concurrent
              player; listed games earn a median of about $12 under the model, as expected of the top earners.
            </li>
          </ul>
        </Section>

        <Section id="limits" title="What this can't tell you">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong className="text-foreground">Retention.</strong> D1, D7 and D30 retention need per-player data that Roblox doesn&apos;t
              make public. New-player share is the closest public signal.
            </li>
            <li>
              <strong className="text-foreground">Games that never reach the discovery lists.</strong> They are never found, so every
              benchmark here describes games that got noticed.
            </li>
            <li>
              <strong className="text-foreground">Bots and idle players.</strong> Roblox&apos;s player counts include AFK accounts; there is
              no public way to remove them.
            </li>
            <li>
              <strong className="text-foreground">How money is made.</strong> Revenue is one modelled total; game passes and developer
              products can&apos;t be told apart from public data. Roblox lists each game&apos;s passes and prices but hides their sales, so
              there is no public way to count how many players buy one.
            </li>
            <li>
              <strong className="text-foreground">Young series.</strong> History starts in May 2026, full tracking on 25 October and revenue
              on 3 November. Figures that need longer windows say so where they appear.
            </li>
          </ul>
          <p>
            Data and exports are free from the{" "}
            <Link href="/api" className="text-link underline">
              API
            </Link>
            . Found something that looks wrong? Every page links back here, and the code that computes each figure is described above.
          </p>
        </Section>
      </div>
    </main>
  );
}

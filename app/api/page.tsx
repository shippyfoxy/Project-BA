import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "API: Roblox Pulse",
  description:
    "Free, read-only JSON and CSV for Roblox Pulse: every game's daily player history and the Explore screener. No key, no sign-up.",
};

const BASE = "https://pulse.shipfox.me";

const SECTIONS = [
  ["quick-start", "Quick start"],
  ["endpoints", "Endpoints"],
  ["explore", "Explore parameters"],
  ["explore-fields", "Explore fields"],
  ["history-fields", "History fields"],
  ["definitions", "Definitions"],
  ["coverage", "Coverage"],
  ["limits", "Limits and credit"],
] as const;

type Row = [ReactNode, ReactNode];

const ENDPOINTS: Row[] = [
  [
    "GET /api/v1/explore",
    <>
      Every game matching a screen, with the same filters as the{" "}
      <Link href="/explore" className="text-link underline">
        Explore
      </Link>{" "}
      page. JSON by default, <C>format=csv</C> for a spreadsheet. Not paged.
    </>,
  ],
  [
    "GET /api/v1/games/{id}/history",
    <>
      Daily player, visit and vote history for one game by its universe ID. Defaults to the last 30 days; set <C>from</C> and{" "}
      <C>to</C> (YYYY-MM-DD) for any range back to 7 May 2026. JSON or <C>format=csv</C>.
    </>,
  ],
  ["GET /api/v1/status", "Where the data comes from and when it was last refreshed."],
];

const EXPLORE_PARAMS: Row[] = [
  [
    "launched",
    <>
      Created within <C>30</C>, <C>60</C>, <C>90</C> or <C>365</C> days, or <C>any</C>. Defaults to 30, or to <C>any</C> when{" "}
      <C>q</C> is set.
    </>,
  ],
  [
    "min",
    <>
      Minimum 7-day average players: <C>100</C>, <C>1000</C>, <C>10000</C> or <C>100000</C>. Leave it out for no minimum.
    </>,
  ],
  [
    "stage",
    <>
      <C>breakout</C>, <C>rising</C>, <C>peaking</C>, <C>cooling</C>, <C>fading</C>, <C>evergreen</C> or <C>steady</C>. Repeat it
      to match any of several.
    </>,
  ],
  [
    "genre",
    <>
      Roblox&apos;s genre name exactly as returned, e.g. <C>Simulation</C> or <C>Roleplay &amp; Avatar Sim</C> (URL-encoded). Repeat
      it to match any of several.
    </>,
  ],
  [
    "country",
    <>
      In that country&apos;s discovery lists in the last 7 days: <C>us</C>, <C>br</C>, <C>id</C>, <C>in</C>, <C>ph</C>, <C>gb</C>,{" "}
      <C>de</C>, <C>ru</C>, <C>kr</C>, <C>mx</C>, <C>tr</C> or <C>jp</C>.
    </>,
  ],
  [
    "device",
    <>
      In that device&apos;s discovery lists in the last 7 days: <C>computer</C>, <C>high_end_phone</C>, <C>low_end_phone</C>,{" "}
      <C>high_end_tablet</C> or <C>console</C>.
    </>,
  ],
  [
    "earning",
    <>
      <C>1</C> for only games in Roblox&apos;s Top Earning list.
    </>,
  ],
  ["q", "Name or studio text, a universe or place ID, or a pasted Roblox game link."],
  [
    "sort",
    <>
      <C>players</C> (default), <C>wow</C>, <C>session</C>, <C>favs</C>, <C>earnings</C> (estimated revenue, so Top Earning rank) or{" "}
      <C>newest</C> (launch date).
    </>,
  ],
  [
    "order",
    <>
      <C>desc</C> (default) or <C>asc</C>. Games with no value for the sort, such as ones too new for week on week, come last either
      way.
    </>,
  ],
  [
    "format",
    <>
      <C>json</C> (default) or <C>csv</C>.
    </>,
  ],
];

const EXPLORE_FIELDS: Row[] = [
  ["universe_id", "Roblox universe ID. Game pages live at /games/{universe_id}."],
  ["name", "The game's name as the site shows it, with tags such as “[🎃]” and emoji removed."],
  ["roblox_name", "The title exactly as Roblox returns it."],
  ["creator", "The owning user or group."],
  ["genre", "Roblox's top-level genre, or “Other” when Roblox gives none."],
  ["stage", "Lifecycle stage, in lower case (see Definitions)."],
  ["created, age_days", "Roblox's creation date and days since, as of the latest refresh."],
  ["players_7d_avg, players_prev_7d_avg", "Average concurrent players over the last 7 days and the 7 before."],
  ["week_on_week_pct", "Change between those two weeks. Null when the game has no readings in the earlier week."],
  ["peak_7d_avg", "Best 7-day average since tracking began."],
  ["est_session_min", "Estimated session length in minutes. Null until there are two consecutive days of readings."],
  ["favourites_per_1k_visits", "Lifetime favourites per 1,000 lifetime visits."],
  ["top_earning_rank", "Position in Roblox's Top Earning list (7-day Robux spend) on the latest day recorded. Null if not listed."],
  [
    "est_monthly_devex_usd",
    <>
      Modelled monthly creator payout in US dollars, rounded to the nearest thousand, from <C>top_earning_rank</C>. An estimate, not a
      measurement; see{" "}
      <Link href="/methodology#revenue" className="text-link underline">
        how it is estimated
      </Link>
      .
    </>,
  ],
];

const HISTORY_FIELDS: Row[] = [
  ["day", "UTC day."],
  ["playing_avg", "Mean concurrent players across the day's readings."],
  [
    "playing_min, playing_max",
    <>
      Lowest and highest reading that day, with <C>playing_max_at</C> for when the high was seen.
    </>,
  ],
  ["visits", "Lifetime visits at the day's last reading. Subtract the previous day's value for new visits."],
  ["favorites, up_votes, down_votes", "Totals at the day's last reading that included them. Null if none did."],
  ["samples", "How many readings the day is based on. Treat days with 1 or 2 with care."],
];

const DEFINITIONS: Row[] = [
  [
    "Stage",
    "Checked in order, first match wins. Breakout: created in the last 30 days with 10,000+ players. Rising: up 25%+ on last week. Peaking: within 10% of its best week. Fading: at half its best week or less. Cooling: down on last week. Evergreen: tracked 120+ days. Otherwise steady.",
  ],
  [
    "7-day average players",
    "The mean of each day's average concurrent players over the last 7 UTC days that have readings.",
  ],
  [
    "Estimated session length",
    "Average players divided by new visits per minute, using the real minutes between the last readings of consecutive days. An estimate from public counts, not measured play time.",
  ],
  [
    "Favourites per 1,000 visits",
    "Compare games of similar size: it falls as lifetime visits pile up.",
  ],
];

function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-foreground">{children}</code>;
}

function Code({ children, muted }: { children: string; muted?: boolean }) {
  return (
    <pre
      className={`overflow-x-auto rounded-xl border border-border bg-card px-4 py-3.5 font-mono text-[13px] leading-relaxed ${
        muted ? "text-text-2" : "text-foreground"
      }`}
    >
      <code>{children}</code>
    </pre>
  );
}

function Table({ rows, mono = true }: { rows: Row[]; mono?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i} className={i ? "border-t border-[#1b2028]" : undefined}>
              <th
                scope="row"
                className={`w-[34%] px-5 py-3 text-left align-top ${mono ? "font-mono text-[13px] font-medium" : "font-semibold"}`}
              >
                {k}
              </th>
              <td className="px-5 py-3 text-text-2">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-6 flex-col gap-3">
      <h2 id={`${id}-h`} className="font-heading text-2xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ApiPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-wrap items-start gap-10 px-4 pb-16 pt-11 md:px-6">
      <nav aria-label="On this page" className="hidden flex-[0_1_200px] flex-col gap-0.5 text-sm lg:sticky lg:top-6 lg:flex">
        <span className="px-2.5 pb-1.5 text-xs text-muted-foreground">On this page</span>
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-lg px-2.5 py-1.5 text-text-2 hover:bg-secondary hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>

      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-9">
        <header className="flex flex-col gap-3">
          <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">API</h1>
          <p className="max-w-2xl text-[17px] text-text-2">
            Free, read-only JSON and CSV for the same data the site shows. No key, no sign-up. Every figure comes from Roblox&apos;s public
            APIs and is an estimate, not Roblox telemetry.
          </p>
        </header>

        <Section id="quick-start" title="Quick start">
          <p className="text-text-2">Daily history for one game, by its Roblox universe ID:</p>
          <Code>{`curl "${BASE}/api/v1/games/10765288803/history?from=2026-10-30&to=2026-10-31"`}</Code>
          <Code muted>{`{
  "game": { "universe_id": 10765288803, "name": "Break and Steal an Egg",
            "roblox_name": "Break and Steal an Egg", "genre": "Simulation" },
  "resolution": "daily",
  "estimated": true,
  "methodology": "${BASE}/methodology",
  "data": [
    { "day": "2026-10-30", "playing_avg": 75746, "playing_min": 51759, "playing_max": 98809,
      "playing_max_at": "2026-10-30T09:17:18Z", "visits": 295543578, "favorites": 682376,
      "up_votes": 408965, "down_votes": 11397, "samples": 4 },
    ...
  ]
}`}</Code>
          <p className="text-text-2">Launched in the last 60 days with 10,000+ players, as a spreadsheet:</p>
          <Code>{`curl -o hits.csv "${BASE}/api/v1/explore?launched=60&min=10000&format=csv"`}</Code>
        </Section>

        <Section id="endpoints" title="Endpoints">
          <Table rows={ENDPOINTS} />
          <p className="text-[13px] text-muted-foreground">
            Errors come back as JSON with an <C>error</C> message: 400 for a bad parameter, 404 for a game we have never tracked, 503 if the
            database is unavailable.
          </p>
        </Section>

        <Section id="explore" title="Explore parameters">
          <p className="text-text-2">
            The Explore page puts the same parameters in its address bar, so the quickest way to build a query is to set the filters there
            and copy the link, or use its Download CSV button.
          </p>
          <Table rows={EXPLORE_PARAMS} />
        </Section>

        <Section id="explore-fields" title="Explore fields">
          <p className="text-text-2">
            JSON responses wrap the rows as <C>games</C>, with <C>as_of</C> (the latest refresh), <C>week_to</C> (the last day in the
            7-day window) and <C>count</C>. The CSV has one row per game with these columns.
          </p>
          <Table rows={EXPLORE_FIELDS} />
        </Section>

        <Section id="history-fields" title="History fields">
          <Table rows={HISTORY_FIELDS} />
        </Section>

        <Section id="definitions" title="Definitions">
          <Table rows={DEFINITIONS} mono={false} />
          <p className="text-[13px] text-muted-foreground">
            More on each estimate and its limits in{" "}
            <Link href="/methodology" className="text-link underline">
              How we measure
            </Link>
            .
          </p>
        </Section>

        <Section id="coverage" title="Coverage">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-text-2">
            <li>Daily history starts on 7 May 2026. Raw readings are kept for 14 days and rolled up into the daily figures above.</li>
            <li>
              The refresh runs 4 to 7 times a day. Each run reads Roblox&apos;s discovery lists for 12 countries and 5 device types, then
              re-reads every game it has ever found there, so a game stays tracked after it drops out of the lists (since 25 October 2026;
              before that, only games in that day&apos;s lists were read).
            </li>
            <li>Readings with zero players are not stored, so a quiet game can have gaps.</li>
            <li>
              Roblox publishes no earnings. Since 3 November 2026 each refresh records every game&apos;s position in Roblox&apos;s public Top
              Earning list (Robux spent in the last 7 days), and revenue figures are modelled from that rank.
            </li>
          </ul>
        </Section>

        <Section id="limits" title="Limits and credit">
          <p className="text-text-2">
            Responses are cached for up to 30 minutes, and the data changes only a few times a day, so polling more often than every half
            hour returns the same answer. There is no hard rate limit today; please keep automated use light so the site stays free to run.
          </p>
          <p className="text-text-2">
            Free to use in your own projects. Please credit Roblox Pulse and link to{" "}
            <Link href="/methodology" className="text-link underline">
              the methodology
            </Link>
            . Roblox Pulse is not affiliated with Roblox.
          </p>
        </Section>
      </div>
    </main>
  );
}

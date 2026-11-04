import type { Metadata } from "next";
import Link from "next/link";
import { getCachedIdeas } from "@/lib/trends/cached";
import { COUNTED_MIN, HIT_MIN, MIN_TERM_GAMES, type Momentum, type Pattern } from "@/lib/trends/ideas";
import { displayName } from "@/lib/trends/names";
import { fmtCompact, fmtDay, fmtInt } from "@/lib/format";
import { GenreChip } from "@/components/v2/GenreChip";
import { ApplyButton, AutoSubmitForm } from "@/components/v2/AutoSubmitForm";
import { UsdSum } from "@/components/pro/Pro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Game ideas: Roblox Pulse",
  description:
    "Which words in Roblox game names are drawing players, which are fading, and where studios are piling in: name patterns and genre signals from every game we track.",
};

const SORTS = {
  players: { label: "Most players", by: (p: Pattern) => p.players },
  // Small patterns swing wildly week to week, so only those with real audiences rank here.
  rising: { label: "Rising fastest", by: (p: Pattern) => (p.vsMarket !== null && p.players >= RISING_MIN_PLAYERS ? p.vsMarket : -Infinity) },
  launches: { label: "Most new games", by: (p: Pattern) => p.launches },
  hits: { label: "Best hit rate", by: (p: Pattern) => (p.launches >= 5 ? p.hits / p.launches : -1) },
  median: { label: "Most players per game", by: (p: Pattern) => p.median },
} as const;
type Sort = keyof typeof SORTS;
const MOMENTA: Momentum[] = ["rising", "crowding", "steady", "fading"];
const MOMENTUM_LABEL: Record<Momentum, string> = { rising: "Rising", crowding: "Crowding in", steady: "Steady", fading: "Fading" };
const MOMENTUM_CLASS: Record<Momentum, string> = {
  rising: "bg-rise/15 text-rise",
  crowding: "bg-gold/18 text-foreground",
  steady: "bg-secondary text-text-2",
  fading: "bg-fall/15 text-fall",
};
const SHOWN = 60;
const RISING_MIN_PLAYERS = 10_000;
const selectClass = "h-10 rounded-[10px] border border-input bg-background px-3 text-sm";
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pts = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x * 100))} pts`;
const pct = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x * 100))}%`;

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex-[1_1_220px] rounded-2xl border border-border bg-card px-5 py-4">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-[30px] font-extrabold leading-tight tracking-tight">{value}</div>
      <div className="text-[13px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function MomentumChip({ m }: { m: Momentum }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${MOMENTUM_CLASS[m]}`}>{MOMENTUM_LABEL[m]}</span>;
}

// Hit rate as a small bar: how many of the last month's new games using a
// pattern reached 1,000 players.
function HitBar({ hits, launches }: { hits: number; launches: number }) {
  if (launches < 3) return <span className="text-muted-foreground">too few</span>;
  const share = hits / launches;
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="60" height="8" viewBox="0 0 60 8" aria-hidden="true" className="block">
        <rect width="60" height="8" rx="4" fill="var(--grid)" />
        <rect width={Math.max(share * 60, 3)} height="8" rx="4" fill="var(--rise)" />
      </svg>
      <span>
        {fmtInt(hits)} of {fmtInt(launches)}
      </span>
    </span>
  );
}

export default async function IdeasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const genre = first(sp.genre) || null;
  const sort: Sort = (first(sp.sort) ?? "") in SORTS ? (first(sp.sort) as Sort) : "players";
  const momentum = MOMENTA.find((m) => m === first(sp.momentum)) ?? null;
  const ideas = await getCachedIdeas(genre).catch(() => null);

  if (!ideas) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Game ideas</h1>
        <p className="mt-4 text-text-2">Ideas are temporarily unavailable. Please try again shortly.</p>
      </main>
    );
  }

  const all = ideas.patterns;
  const shown = all
    .filter((p) => (!momentum || p.momentum === momentum) && SORTS[sort].by(p) > -Infinity)
    .sort((a, b) => SORTS[sort].by(b) - SORTS[sort].by(a))
    .slice(0, SHOWN);
  const risingTop = [...all].filter((p) => p.momentum === "rising" && p.games >= 8 && p.players >= RISING_MIN_PLAYERS).sort((a, b) => b.vsMarket! - a.vsMarket!)[0];
  const crowdTop = [...all].filter((p) => p.momentum === "crowding").sort((a, b) => b.launches - a.launches)[0];
  const hitTop = [...all].filter((p) => p.launches >= 8).sort((a, b) => b.hits / b.launches - a.hits / a.launches)[0];
  const href = (over: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const v = { genre, sort: sort === "players" ? null : sort, momentum, ...over };
    for (const [k, x] of Object.entries(v)) if (x) q.set(k, x);
    const s = q.toString();
    return s ? `/ideas?${s}` : "/ideas";
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-9 md:px-6">
      <section className="flex flex-col gap-3">
        <h1 className="font-heading text-[clamp(36px,6vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em]">Game ideas</h1>
        <p className="max-w-[780px] text-base text-text-2">
          What players are picking right now, from every game we track: the words that keep turning up in the names of popular games, whether
          they are gaining or fading against the market, how many new games are trying them and how many of those took off.
        </p>
      </section>

      <section aria-label="Key figures" className="flex flex-wrap gap-3">
        <Tile
          label="The market this week"
          value={ideas.marketGrowth === null ? "—" : pct(ideas.marketGrowth)}
          hint={`players across every game, week to ${fmtDay(Date.parse(ideas.day))}`}
        />
        {risingTop ? (
          <Tile label="Rising fastest" value={`“${risingTop.term}”`} hint={`${pts(risingTop.vsMarket!)} against the market, ${risingTop.games} games${risingTop.topShare >= 0.6 ? `, led by ${displayName(risingTop.top[0].name)}` : ""}`} />
        ) : null}
        {crowdTop ? (
          <Tile label="Studios piling in" value={`“${crowdTop.term}”`} hint={`${crowdTop.launches} new games in 30 days, up from ${crowdTop.launchesBefore}`} />
        ) : null}
        {hitTop ? (
          <Tile
            label="Best odds for a new game"
            value={`“${hitTop.term}”`}
            hint={`${hitTop.hits} of ${hitTop.launches} new games reached ${fmtInt(HIT_MIN)} players`}
          />
        ) : null}
      </section>

      <section aria-labelledby="patterns" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="patterns" className="font-heading text-[28px] font-bold tracking-[-0.02em]">
            Name patterns{genre ? ` in ${genre}` : ""}
          </h2>
          <AutoSubmitForm action="/ideas" className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[13px] text-muted-foreground">
              Genre
              <select name="genre" defaultValue={genre ?? ""} className={selectClass}>
                <option value="">Every genre</option>
                {ideas.genres.map((g) => (
                  <option key={g.genre} value={g.genre}>
                    {g.genre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-muted-foreground">
              Momentum
              <select name="momentum" defaultValue={momentum ?? ""} className={selectClass}>
                <option value="">Any</option>
                {MOMENTA.map((m) => (
                  <option key={m} value={m}>
                    {MOMENTUM_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-muted-foreground">
              Sort
              <select name="sort" defaultValue={sort} className={selectClass}>
                {Object.entries(SORTS).map(([k, s]) => (
                  <option key={k} value={k}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <ApplyButton />
          </AutoSubmitForm>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-text-2">
            No patterns match.{" "}
            <Link href="/ideas" className="text-link hover:underline">
              Show every pattern
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[980px] border-collapse text-sm tabular-nums">
              <caption className="sr-only">Words in game names, with players, momentum, new games and modelled revenue</caption>
              <thead>
                <tr className="text-right text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    Pattern
                  </th>
                  <th scope="col" className="px-2 py-3 text-left font-medium">
                    Momentum
                  </th>
                  <th scope="col" className="px-2 py-3 font-medium">Games</th>
                  <th scope="col" className="px-2 py-3 font-medium">Players</th>
                  <th scope="col" className="px-2 py-3 font-medium">Against market</th>
                  <th scope="col" className="px-2 py-3 font-medium">Per game</th>
                  <th scope="col" className="px-2 py-3 text-left font-medium">New games, hit {fmtCompact(HIT_MIN)}</th>
                  <th scope="col" className="px-2 py-3 font-medium">Est. revenue</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    Biggest games
                  </th>
                </tr>
              </thead>
              <tbody className="text-right">
                {shown.map((p) => (
                  <tr key={p.term} className="border-t border-rule align-top hover:bg-surface-2">
                    <th scope="row" className="px-4 py-2.5 text-left font-semibold">
                      <Link href={`/explore?launched=any&q=${encodeURIComponent(p.term)}`} className="hover:text-link">
                        {p.term}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap gap-1 font-normal">
                        {p.genres.map(([g]) => (
                          <GenreChip key={g} genre={g} />
                        ))}
                      </span>
                    </th>
                    <td className="px-2 py-2.5 text-left">
                      <MomentumChip m={p.momentum} />
                    </td>
                    <td className="px-2 py-2.5">{fmtInt(p.games)}</td>
                    <td className="px-2 py-2.5">
                      {fmtCompact(p.players, 1)}
                      {p.topShare >= 0.6 ? (
                        <span className="block text-xs text-muted-foreground">{Math.round(p.topShare * 100)}% one game</span>
                      ) : null}
                    </td>
                    <td className={`px-2 py-2.5 font-semibold ${p.vsMarket === null ? "" : p.vsMarket >= 0 ? "text-rise" : "text-fall"}`}>
                      {p.vsMarket === null ? "—" : pts(p.vsMarket)}
                    </td>
                    <td className="px-2 py-2.5">{fmtInt(p.median)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-left">
                      <HitBar hits={p.hits} launches={p.launches} />
                      {p.launches >= 3 ? (
                        <span className="block text-xs text-muted-foreground">
                          {p.launches > p.launchesBefore ? "up" : p.launches < p.launchesBefore ? "down" : "level"} from {p.launchesBefore} the month before
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5">
                      {p.earners ? (
                        <>
                          <UsdSum ranks={p.earnerRanks} suffix="/mo" />
                          <span className="block text-xs text-muted-foreground">{p.earners} ranked</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">none ranked</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-left text-[13px] text-text-2">
                      {p.top.map((g, i) => (
                        <span key={g.universeId}>
                          {i ? ", " : ""}
                          <Link href={`/games/${g.universeId}`} className="hover:text-link">
                            {displayName(g.name)}
                          </Link>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[13px] text-muted-foreground">
          Showing {fmtInt(shown.length)} of {fmtInt(all.length)} patterns. {sort !== "rising" ? <Link href={href({ sort: "rising" })} className="text-link hover:underline">See what is rising fastest</Link> : null}
        </p>
      </section>

      <section aria-labelledby="genres" className="flex flex-col gap-3">
        <h2 id="genres" className="font-heading text-[28px] font-bold tracking-[-0.02em]">
          Genres at a glance
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[860px] border-collapse text-sm tabular-nums">
            <caption className="sr-only">Genres by players, momentum, new games and modelled revenue</caption>
            <thead>
              <tr className="text-right text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Genre
                </th>
                <th scope="col" className="px-2 py-3 font-medium">Games</th>
                <th scope="col" className="px-2 py-3 font-medium">Players</th>
                <th scope="col" className="px-2 py-3 font-medium">Against market</th>
                <th scope="col" className="px-2 py-3 font-medium">Per game</th>
                <th scope="col" className="px-2 py-3 text-left font-medium">New games, hit {fmtCompact(HIT_MIN)}</th>
                <th scope="col" className="px-4 py-3 font-medium">Est. revenue</th>
              </tr>
            </thead>
            <tbody className="text-right">
              {ideas.genres.map((g) => (
                <tr key={g.genre} className="border-t border-rule hover:bg-surface-2">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">
                    <Link href={href({ genre: g.genre })} className="hover:text-link">
                      <GenreChip genre={g.genre} />
                    </Link>
                  </th>
                  <td className="px-2 py-2.5">{fmtInt(g.games)}</td>
                  <td className="px-2 py-2.5">{fmtCompact(g.players, 1)}</td>
                  <td className={`px-2 py-2.5 font-semibold ${g.vsMarket === null ? "" : g.vsMarket >= 0 ? "text-rise" : "text-fall"}`}>
                    {g.vsMarket === null ? "—" : pts(g.vsMarket)}
                  </td>
                  <td className="px-2 py-2.5">{fmtInt(g.median)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-left">
                    <HitBar hits={g.hits} launches={g.launches} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">{g.earners ? <UsdSum ranks={g.earnerRanks} suffix="/mo" /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex max-w-[860px] flex-col gap-2 text-[13px] text-muted-foreground">
        <p>
          <strong className="text-text-2">How to read this.</strong> A pattern is a word or pair of words in game names, with tags and emoji
          removed, found in at least {MIN_TERM_GAMES} games averaging {fmtInt(COUNTED_MIN)}+ players. Games and per game count those games;
          players add up the 7-day averages of every game using it. Against market is its players&apos; change on last week minus the change
          for every game ({ideas.marketGrowth === null ? "unknown" : pct(ideas.marketGrowth)}), so a quiet week everywhere doesn&apos;t mark
          everything as fading. Rising and fading mean 10 points or more either way; crowding in means at least half as many new games again
          as the month before while players are not rising.
        </p>
        <p>
          New games are those that first reached Roblox&apos;s discovery lists in the last 30 days within 60 days of being created; a hit
          averaged {fmtInt(HIT_MIN)}+ players this week. Revenue is modelled from Top Earning ranks, like everywhere on the site. A word in a
          name doesn&apos;t make a game: patterns show what players are choosing, not a formula.
        </p>
      </section>
    </main>
  );
}

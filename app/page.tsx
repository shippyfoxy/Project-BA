import Link from "next/link";
import { getSiteDb } from "@/lib/db/site";
import { getTrendsHome, type HomeGame, type Mover } from "@/lib/trends/home";
import { displayName } from "@/lib/trends/names";
import type { Stage } from "@/lib/trends/stage";
import { getGameIcons } from "@/lib/roblox/thumbnails";
import { fmtCompact, fmtDay, fmtInt, fmtPct, fmtTimeUtc, fmtWeekdayDay } from "@/lib/format";
import { GameIcon } from "@/components/v2/GameIcon";
import { GenreChip } from "@/components/v2/GenreChip";
import { Sparkline } from "@/components/v2/Sparkline";
import { StageBadge } from "@/components/v2/StageBadge";
import { WeeklyRhythm } from "@/components/v2/WeeklyRhythm";

export const revalidate = 3600;
// Room for a cold Neon compute to wake during the hourly rebuild.
export const maxDuration = 30;

const PULSE: { stage: Stage; note: string }[] = [
  { stage: "breakout", note: "launched in 30 days, 10k+ players" },
  { stage: "rising", note: "up 25%+ on last week" },
  { stage: "peaking", note: "within 10% of their best week" },
  { stage: "cooling", note: "down on last week, above half of peak" },
  { stage: "fading", note: "at half their peak or less" },
  { stage: "evergreen", note: "holding up after 120+ days" },
  { stage: "steady", note: "newer games holding level" },
];

const PODIUM = [
  { place: "1st", ring: "#e5b13a" },
  { place: "2nd", ring: "#b8c0cc" },
  { place: "3rd", ring: "#c98b55" },
];

function robloxUrl(g: HomeGame): string | undefined {
  return g.canonicalUrlPath ? `https://www.roblox.com${g.canonicalUrlPath}` : undefined;
}

function GameLink({ game, className, children }: { game: HomeGame; className: string; children: React.ReactNode }) {
  const href = robloxUrl(game);
  if (!href) return <div className={className}>{children}</div>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only"> (opens on Roblox)</span>
    </a>
  );
}

function SectionTitle({ id, children, aside }: { id: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} className="font-heading text-[28px] font-bold tracking-tight">
        {children}
      </h2>
      {aside ? <span className="text-[13px] text-muted-foreground">{aside}</span> : null}
    </div>
  );
}

function MoverList({ title, tone, games, icons }: { title: string; tone: "rise" | "fall"; games: Mover[]; icons: Map<number, string> }) {
  return (
    <div className="min-w-0 flex-[1_1_440px] overflow-hidden rounded-2xl border border-border bg-card">
      <h3 className="flex items-center gap-2 border-b border-border px-5 py-3.5 text-[15px] font-semibold">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <polygon points={tone === "rise" ? "5,1 9.5,9 0.5,9" : "0.5,1 9.5,1 5,9"} fill={tone === "rise" ? "var(--rise)" : "var(--fall)"} />
        </svg>
        {title}
      </h3>
      {games.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No qualifying games this week.</p>
      ) : (
        <ul>
          {games.map((g) => {
            const name = displayName(g.name);
            return (
              <li key={g.universeId} className="border-b border-[#1b2028] last:border-0">
                <GameLink game={g} className="grid grid-cols-[40px_minmax(0,1fr)_64px] items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:grid-cols-[40px_minmax(0,1fr)_auto_64px] sm:px-5">
                  <GameIcon url={icons.get(g.universeId)} name={name} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {g.genre} · {fmtInt(g.cur7)} players
                    </span>
                  </span>
                  <span className="hidden sm:block">
                    <Sparkline values={g.spark} tone={tone} label={`Daily players over the last 30 days, ${tone === "rise" ? "rising" : "falling"}`} />
                  </span>
                  <span className="text-right font-bold tabular-nums">{fmtPct(g.wowPct!)}</span>
                </GameLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default async function TrendsHomePage() {
  const db = getSiteDb();
  let data = null;
  if (db) {
    try {
      data = await getTrendsHome(db);
    } catch (err) {
      console.error("[home] trends query failed:", err);
    }
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h1 className="font-heading text-4xl font-extrabold tracking-tight">What&apos;s moving on Roblox</h1>
        <p className="mt-4 max-w-xl text-text-2">
          Live trends are temporarily unavailable. The{" "}
          <Link href="/dashboard" className="text-link underline">
            classic dashboard
          </Link>{" "}
          still shows the latest snapshot.
        </p>
      </main>
    );
  }

  const icons = await getGameIcons([...data.top, ...data.risers, ...data.fallers].map((g) => g.universeId));
  const podium = data.top.slice(0, 3);
  const rest = data.top.slice(3);
  const week = `${fmtDay(Date.parse(data.weekFrom))} to ${fmtDay(Date.parse(data.weekTo))}`;
  const { biggestReading, fastestToMillion, alwaysTop10, biggestShare } = data.records;
  const topStudiosOneHit = data.studios.every((s) => s.bigGames <= 1);

  return (
    <>
      <section
        className="border-b border-[#1b2028]"
        style={{ backgroundImage: "radial-gradient(#1d232d 1.2px, transparent 1.2px)", backgroundSize: "22px 22px" }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pb-11 pt-14 md:px-6">
          <span className="self-start rounded-full bg-[rgba(74,139,232,0.14)] px-3 py-1 text-[13px] font-medium">
            {fmtInt(data.gamesTracked)} games · {fmtInt(data.daysOfHistory)} days · {fmtCompact(data.readings)} readings
          </span>
          <h1 className="max-w-3xl font-heading text-5xl font-extrabold leading-none tracking-[-0.035em] md:text-6xl">
            What&apos;s moving on Roblox
          </h1>
          <p className="max-w-2xl text-lg text-text-2">
            Player history for every game in Roblox&apos;s discovery lists since May. Spot breakouts early and see what&apos;s
            fading.
          </p>
          <form action="/explore" method="get" role="search" className="flex max-w-2xl flex-wrap gap-2">
            <label htmlFor="game-search" className="sr-only">
              Search games, studios or universe IDs
            </label>
            <div className="flex h-[52px] min-w-0 flex-[1_1_320px] items-center gap-2.5 rounded-[14px] border border-input bg-card px-4 focus-within:border-ring">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="8" cy="8" r="6" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" />
                <line x1="12.5" y1="12.5" x2="16.5" y2="16.5" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                id="game-search"
                name="q"
                type="search"
                placeholder="Search games, studios, universe IDs or paste a Roblox link"
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button type="submit" className="h-[52px] rounded-[14px] bg-rise px-6 font-bold text-background hover:brightness-110">
              Search
            </button>
          </form>
          <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span aria-hidden="true" className="inline-block size-2 rounded-full bg-[#3fa34d]" />
            Last refresh {fmtTimeUtc(data.asOfMs)}, {fmtDay(data.asOfMs)} · {fmtCompact(data.playingNow)} playing across{" "}
            {fmtInt(data.gamesNow)} games
          </p>
        </div>
      </section>

      <main className="mx-auto flex max-w-6xl flex-col gap-11 px-4 pb-16 pt-10 md:px-6">
        <section aria-labelledby="pulse" className="flex flex-col gap-3.5">
          <SectionTitle id="pulse" aside={`${fmtInt(data.activeGames)} games averaging 1,000+ players, ${week}`}>
            Market pulse
          </SectionTitle>
          <ul className="flex flex-wrap gap-2.5">
            {PULSE.map((p) => (
              <li key={p.stage} className="flex flex-[1_1_128px] flex-col gap-1.5 rounded-[14px] border border-border bg-card px-3.5 py-3.5">
                <span className="self-start">
                  <StageBadge stage={p.stage} />
                </span>
                <span className="font-heading text-3xl font-bold tabular-nums">{fmtInt(data.stageCounts[p.stage])}</span>
                <span className="text-xs text-muted-foreground">{p.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="podium" className="flex flex-col gap-4">
          <SectionTitle id="podium" aside={`7-day average concurrent players, ${week}`}>
            Most played this week
          </SectionTitle>
          <ol className="flex flex-wrap items-end gap-3.5">
            {podium.map((g, rank) => {
              const p = PODIUM[rank];
              const big = rank === 0;
              const name = displayName(g.name);
              // Phones list 1st, 2nd, 3rd; wider screens show a podium with 1st in the middle.
              const order = ["md:order-2", "md:order-1", "md:order-3"][rank];
              return (
                <li key={g.universeId} className={`min-w-0 flex-[1_1_260px] ${order}`}>
                  <GameLink
                    game={g}
                    className={`flex flex-col items-center gap-2 rounded-[20px] border bg-card p-5 text-center hover:bg-surface-2 ${big ? "border-input py-6" : "border-border"}`}
                  >
                    <GameIcon url={icons.get(g.universeId)} name={name} size={big ? 104 : 84} ring={p.ring} />
                    <span className="font-heading text-[15px] font-extrabold" style={{ color: p.ring }}>
                      {p.place}
                    </span>
                    <span className={`font-semibold ${big ? "text-xl" : "text-lg"}`}>{name}</span>
                    <span className={`font-heading font-extrabold tracking-tight tabular-nums ${big ? "text-[38px]" : "text-3xl"}`}>
                      {fmtInt(g.cur7)}
                    </span>
                    <span className="flex flex-wrap justify-center gap-1.5">
                      <GenreChip genre={g.genre} />
                      <StageBadge stage={g.stage} />
                    </span>
                  </GameLink>
                </li>
              );
            })}
          </ol>
          <ol start={4} className="overflow-hidden rounded-2xl border border-border bg-card">
            {rest.map((g, i) => {
              const name = displayName(g.name);
              return (
                <li key={g.universeId} className="border-b border-[#1b2028] last:border-0">
                  <GameLink game={g} className="grid grid-cols-[20px_40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:grid-cols-[24px_40px_minmax(0,1fr)_auto_96px] sm:px-5">
                    <span className="tabular-nums text-muted-foreground">{i + 4}</span>
                    <GameIcon url={icons.get(g.universeId)} name={name} size={40} />
                    <span className="min-w-0 truncate font-medium">{name}</span>
                    <span className="hidden sm:inline-flex">
                      <StageBadge stage={g.stage} />
                    </span>
                    <span className="text-right tabular-nums">{fmtInt(g.cur7)}</span>
                  </GameLink>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="movers" className="flex flex-col gap-3.5">
          <SectionTitle id="movers">Biggest moves this week</SectionTitle>
          <p className="text-[13px] text-muted-foreground">
            Change in 7-day average players against the week before, for games averaging 3,000+ that week. Lines show the
            daily average over the last 30 days.
          </p>
          <div className="flex flex-wrap gap-4">
            <MoverList title="Rising" tone="rise" games={data.risers} icons={icons} />
            <MoverList title="Falling" tone="fall" games={data.fallers} icons={icons} />
          </div>
        </section>

        <section aria-labelledby="records" className="flex flex-col gap-3.5">
          <SectionTitle id="records">Records since May</SectionTitle>
          <ul className="flex flex-wrap gap-3">
            {biggestReading ? (
              <li className="flex flex-[1_1_250px] flex-col gap-1.5 rounded-2xl border border-border bg-card px-5 py-4">
                <span className="text-[13px] text-muted-foreground">Biggest single reading</span>
                <span className="font-heading text-[34px] font-extrabold tracking-tight">{fmtCompact(biggestReading.players)}</span>
                <span className="text-[13px] text-text-2">
                  {displayName(biggestReading.name)}, {fmtWeekdayDay(biggestReading.atMs)} at {fmtTimeUtc(biggestReading.atMs)}
                </span>
              </li>
            ) : null}
            {fastestToMillion ? (
              <li className="flex flex-[1_1_250px] flex-col gap-1.5 rounded-2xl border border-border bg-card px-5 py-4">
                <span className="text-[13px] text-muted-foreground">Fastest to a 1M 7-day average</span>
                <span className="font-heading text-[34px] font-extrabold tracking-tight">{fastestToMillion.days} days</span>
                <span className="text-[13px] text-text-2">{displayName(fastestToMillion.name)}, from creation</span>
              </li>
            ) : null}
            {alwaysTop10.names.length > 0 ? (
              <li className="flex flex-[1_1_250px] flex-col gap-1.5 rounded-2xl border border-border bg-card px-5 py-4">
                <span className="text-[13px] text-muted-foreground">Never left the top 10</span>
                <span className="font-heading text-[34px] font-extrabold tracking-tight">
                  {alwaysTop10.names.length} {alwaysTop10.names.length === 1 ? "game" : "games"}
                </span>
                <span className="text-[13px] text-text-2">
                  {alwaysTop10.names.map(displayName).join(", ")}, all {alwaysTop10.days} days
                </span>
              </li>
            ) : null}
            {biggestShare ? (
              <li className="flex flex-[1_1_250px] flex-col gap-1.5 rounded-2xl border border-border bg-card px-5 py-4">
                <span className="text-[13px] text-muted-foreground">Biggest share for one game</span>
                <span className="font-heading text-[34px] font-extrabold tracking-tight">{biggestShare.pct.toFixed(1)}%</span>
                <span className="text-[13px] text-text-2">
                  of tracked players went to {displayName(biggestShare.name)}, week of {fmtDay(Date.parse(biggestShare.weekStart))}
                </span>
              </li>
            ) : null}
          </ul>
        </section>

        <div className="flex flex-wrap gap-4">
          <section aria-labelledby="rhythm" className="flex min-w-0 flex-[1_1_440px] flex-col gap-2.5 rounded-2xl border border-border bg-card px-6 py-5">
            <h2 id="rhythm" className="font-heading text-[22px] font-bold">
              Roblox&apos;s weekly rhythm
            </h2>
            <p className="text-[13px] text-muted-foreground">
              All tracked players by day of the week over the last 20 weeks, as % of the weekly average.
            </p>
            <WeeklyRhythm rhythm={data.rhythm} />
          </section>

          <section aria-labelledby="studios" className="flex min-w-0 flex-[1_1_440px] flex-col gap-2.5 rounded-2xl border border-border bg-card px-6 py-5">
            <h2 id="studios" className="font-heading text-[22px] font-bold">
              Biggest studios this week
            </h2>
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 font-medium">Studio</th>
                  <th scope="col" className="py-1.5 font-medium">Top game</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Players</th>
                </tr>
              </thead>
              <tbody>
                {data.studios.map((s) => (
                  <tr key={s.name} className="border-t border-[#1b2028]">
                    <td className="py-2 pr-3">{s.name}</td>
                    <td className="py-2 pr-3 text-text-2">{displayName(s.topGame)}</td>
                    <td className="py-2 text-right">{fmtInt(s.players)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {topStudiosOneHit ? (
              <p className="flex gap-2.5 rounded-xl bg-[rgba(229,177,58,0.10)] px-3.5 py-3 text-sm">
                <svg width="16" height="16" viewBox="0 0 12 12" aria-hidden="true" className="mt-0.5 shrink-0">
                  <polygon points="6,0.8 7.6,4.3 11.4,4.6 8.5,7.1 9.4,10.9 6,8.9 2.6,10.9 3.5,7.1 0.6,4.6 4.4,4.3" fill="var(--gold)" />
                </svg>
                <span>
                  <strong>Takeaway:</strong> each of these studios has one game above 10,000 players. Only{" "}
                  {data.studiosWithSeveralHits} {data.studiosWithSeveralHits === 1 ? "studio has" : "studios have"} two or more.
                </span>
              </p>
            ) : null}
          </section>
        </div>

        <section className="flex flex-wrap gap-4">
          <Link href="/explore" className="flex flex-[1_1_260px] flex-col gap-1.5 rounded-2xl border border-border bg-card px-6 py-5 hover:bg-surface-2">
            <span className="font-heading text-xl font-bold">Explore</span>
            <span className="text-sm text-text-2">Find any game, studio or universe ID in the history.</span>
          </Link>
          <Link href="/dashboard" className="flex flex-[1_1_260px] flex-col gap-1.5 rounded-2xl border border-border bg-card px-6 py-5 hover:bg-surface-2">
            <span className="font-heading text-xl font-bold">Classic dashboard</span>
            <span className="text-sm text-text-2">Retention and session-length proxies by genre, age rating and region.</span>
          </Link>
          <Link href="/methodology" className="flex flex-[1_1_260px] flex-col gap-1.5 rounded-2xl border border-border bg-card px-6 py-5 hover:bg-surface-2">
            <span className="font-heading text-xl font-bold">How we measure</span>
            <span className="text-sm text-text-2">Where the numbers come from and what they can&apos;t tell you.</span>
          </Link>
        </section>
      </main>
    </>
  );
}

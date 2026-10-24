import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteDb } from "@/lib/db/site";
import { getCachedActiveGames } from "@/lib/trends/cached";
import { countStages, getSparklines, type HomeGame } from "@/lib/trends/home";
import { displayName } from "@/lib/trends/names";
import { STAGES, type Stage } from "@/lib/trends/stage";
import { getGameIcons } from "@/lib/roblox/thumbnails";
import { fmtDay, fmtInt, fmtPct } from "@/lib/format";
import { GameIcon } from "@/components/v2/GameIcon";
import { GenreChip } from "@/components/v2/GenreChip";
import { Sparkline } from "@/components/v2/Sparkline";
import { StageBadge, stageLabel } from "@/components/v2/StageBadge";

export const revalidate = 3600;
export const maxDuration = 30;
export const dynamicParams = false;

const LIMIT = 100;
const DAY_MS = 86_400_000;

const COPY: Record<Stage, { intro: string; sortedBy: string; sort: (a: HomeGame, b: HomeGame) => number }> = {
  breakout: {
    intro: "Launched in the last 30 days and already averaging 10,000+ players.",
    sortedBy: "players",
    sort: (a, b) => b.cur7 - a.cur7,
  },
  rising: {
    intro: "Up 25% or more on the week before.",
    sortedBy: "biggest jump on last week",
    sort: (a, b) => (b.wowPct ?? 0) - (a.wowPct ?? 0),
  },
  peaking: {
    intro: "Within 10% of their best 7-day average ever.",
    sortedBy: "players",
    sort: (a, b) => b.cur7 - a.cur7,
  },
  cooling: {
    intro: "Down on last week but still above half of their peak.",
    sortedBy: "players",
    sort: (a, b) => b.cur7 - a.cur7,
  },
  fading: {
    intro: "At half their best 7-day average or less.",
    sortedBy: "furthest below their peak",
    sort: (a, b) => a.cur7 / a.peak7 - b.cur7 / b.peak7,
  },
  evergreen: {
    intro: "Tracked for 120+ days and still holding up, without rising, peaking or fading.",
    sortedBy: "players",
    sort: (a, b) => b.cur7 - a.cur7,
  },
  steady: {
    intro: "Newer games holding level: not rising, peaking, cooling or fading.",
    sortedBy: "players",
    sort: (a, b) => b.cur7 - a.cur7,
  },
};

const isStage = (s: string): s is Stage => (STAGES as string[]).includes(s);

export function generateStaticParams() {
  return STAGES.map((stage) => ({ stage }));
}

export async function generateMetadata({ params }: { params: Promise<{ stage: string }> }): Promise<Metadata> {
  const { stage } = await params;
  if (!isStage(stage)) return {};
  return {
    title: `${stageLabel(stage)} Roblox games: Roblox Pulse`,
    description: `${COPY[stage].intro} Every ${stageLabel(stage).toLowerCase()} game this week, from Roblox Pulse.`,
  };
}

export default async function StagePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;
  if (!isStage(stage)) notFound();
  const db = getSiteDb();
  const active = db ? await getCachedActiveGames() : null;

  if (!db || !active) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h1 className="font-heading text-4xl font-extrabold tracking-tight">{stageLabel(stage)} games</h1>
        <p className="mt-4 text-text-2">Stage lists are temporarily unavailable. Please try again shortly.</p>
      </main>
    );
  }

  const copy = COPY[stage];
  const counts = countStages(active.games);
  const all = active.games.filter((g) => g.stage === stage).sort(copy.sort);
  const shown = all.slice(0, LIMIT);
  const ids = shown.map((g) => g.universeId);
  const [icons, sparks] = await Promise.all([getGameIcons(ids), getSparklines(db, ids, active.day)]);
  const weekFrom = Date.parse(active.day) - 6 * DAY_MS;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-16 pt-8 md:px-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-[13px] text-muted-foreground">
        <Link href="/" className="text-text-2 hover:text-foreground">
          Trends
        </Link>
        <span aria-hidden="true">/</span>
        <span>Market pulse</span>
      </nav>

      <header className="flex flex-col gap-3">
        <span className="self-start">
          <StageBadge stage={stage} />
        </span>
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">
          {fmtInt(all.length)} {stageLabel(stage).toLowerCase()} {all.length === 1 ? "game" : "games"}
        </h1>
        <p className="max-w-2xl text-lg text-text-2">{copy.intro}</p>
        <p className="text-[13px] text-muted-foreground">
          Games averaging 1,000+ players, {fmtDay(weekFrom)} to {fmtDay(Date.parse(active.day))}. Sorted by {copy.sortedBy}.
        </p>
      </header>

      <nav aria-label="Lifecycle stages" className="flex flex-wrap gap-2">
        {STAGES.map((s) => (
          <Link
            key={s}
            href={`/stages/${s}`}
            aria-current={s === stage ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium ${
              s === stage ? "border-foreground bg-foreground text-background" : "border-input text-text-2 hover:text-foreground"
            }`}
          >
            {stageLabel(s)}
            <span className={`tabular-nums ${s === stage ? "text-background/70" : "text-muted-foreground"}`}>{fmtInt(counts[s])}</span>
          </Link>
        ))}
      </nav>

      {all.length === 0 ? (
        <p className="text-text-2">No games are in this stage this week.</p>
      ) : (
        <section aria-label={`${stageLabel(stage)} games`} className="flex flex-col gap-3">
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[820px] border-collapse text-sm tabular-nums">
              <thead>
                <tr className="text-right text-xs text-muted-foreground">
                  <th scope="col" className="w-10 px-4 py-3 text-left font-medium">#</th>
                  <th scope="col" className="px-2 py-3 text-left font-medium">Game</th>
                  <th scope="col" className="px-2 py-3 font-medium">7-day avg</th>
                  <th scope="col" className="px-2 py-3 font-medium">Week on week</th>
                  <th scope="col" className="px-2 py-3 font-medium">Of peak</th>
                  <th scope="col" className="px-2 py-3 font-medium">Age</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last 30 days</th>
                </tr>
              </thead>
              <tbody className="text-right">
                {shown.map((g, i) => {
                  const name = displayName(g.name);
                  const age = g.createdMs ? Math.max(0, Math.round((active.asOfMs - g.createdMs) / DAY_MS)) : null;
                  const falling = (g.wowPct ?? 0) < 0;
                  return (
                    <tr key={g.universeId} className="border-t border-[#1b2028] hover:bg-surface-2">
                      <td className="px-4 py-2.5 text-left text-muted-foreground">{i + 1}</td>
                      <th scope="row" className="px-2 py-2.5 text-left font-medium">
                        <Link href={`/games/${g.universeId}`} className="flex items-center gap-3 hover:text-link">
                          <GameIcon url={icons.get(g.universeId)} name={name} size={40} />
                          <span className="min-w-0">
                            <span className="block max-w-[280px] truncate">{name}</span>
                            <span className="mt-0.5 block">
                              <GenreChip genre={g.genre} />
                            </span>
                          </span>
                        </Link>
                      </th>
                      <td className="px-2 py-2.5">{fmtInt(g.cur7)}</td>
                      <td className="px-2 py-2.5">{g.wowPct === null ? <span className="text-muted-foreground">new</span> : fmtPct(g.wowPct)}</td>
                      <td className="px-2 py-2.5">{Math.round((100 * g.cur7) / g.peak7)}%</td>
                      <td className="px-2 py-2.5 text-text-2">{age === null ? "—" : age >= 365 ? `${Math.floor(age / 365)} yr` : `${age} d`}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex justify-end">
                          <Sparkline
                            values={sparks.get(g.universeId) ?? []}
                            tone={falling || stage === "fading" ? "fall" : "rise"}
                            label={`Daily players for ${name} over the last 30 days`}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {all.length > LIMIT ? (
            <p className="text-[13px] text-muted-foreground">
              Showing the top {LIMIT} of {fmtInt(all.length)}. Use{" "}
              <Link href="/explore" className="text-link underline">
                Explore
              </Link>{" "}
              to find any game.
            </p>
          ) : null}
        </section>
      )}

      <aside className="rounded-xl border border-dashed border-input px-4 py-3.5 text-[13px] text-text-2">
        <strong className="text-foreground">How stages work.</strong> Each game gets the first stage that fits, checked in
        this order: breakout, rising, peaking, fading, cooling, evergreen, steady. They are based on 7-day averages of
        public player counts, so they describe momentum, not retention.{" "}
        <Link href="/methodology" className="text-link underline">
          Methodology
        </Link>
      </aside>
    </main>
  );
}

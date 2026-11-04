import type { Metadata } from "next";
import Link from "next/link";
import { getSiteDb } from "@/lib/db/site";
import { COMPARE_COLORS, daysSince, defaultCompareIds, getCompareGames, MAX_COMPARE, parseIds, type CompareGame } from "@/lib/trends/compare";
import { parseSearch, searchGames, type SearchHit } from "@/lib/trends/search";
import { displayName } from "@/lib/trends/names";
import { getGameIcons } from "@/lib/roblox/thumbnails";
import { fmtDay, fmtInt } from "@/lib/format";
import { niceMax } from "@/lib/stats";
import { Usd } from "@/components/pro/Pro";
import { GameIcon } from "@/components/v2/GameIcon";
import { GenreChip } from "@/components/v2/GenreChip";
import { LineChart, type LineSeries } from "@/components/v2/LineChart";

export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Compare launches: Roblox Pulse",
  description: "Line up Roblox games by the day they were created to see whether a new launch is tracking like the last big hit.",
};

type SearchParams = Record<string, string | string[] | undefined>;
type Align = "created" | "date";
type Scale = "pct" | "players";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function href(ids: number[], align: Align, scale: Scale, q?: string) {
  const p = new URLSearchParams();
  p.set("ids", ids.join(","));
  if (align !== "created") p.set("align", align);
  if (scale !== "pct") p.set("scale", scale);
  if (q) p.set("q", q);
  return `/compare?${p.toString()}`;
}

function Toggle<T extends string>({ label, value, options, link }: { label: string; value: T; options: [T, string][]; link: (v: T) => string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[10px] border border-border bg-background p-[3px]">
      {options.map(([v, text]) => (
        <Link
          key={v}
          href={link(v)}
          scroll={false}
          aria-current={v === value ? "true" : undefined}
          className={`flex h-9 items-center rounded-lg px-3 text-[13px] ${v === value ? "bg-surface-2 font-semibold text-foreground" : "text-text-2 hover:text-foreground"}`}
        >
          {text}
        </Link>
      ))}
    </div>
  );
}

function takeaway(games: CompareGame[]): string | null {
  const dated = games.filter((g) => g.createdMs !== null);
  if (dated.length < 2) return null;
  const peakDay = (g: CompareGame) => daysSince(g.createdMs, g.peak.dayMs)!;
  const sorted = [...dated].sort((a, b) => peakDay(b) - peakDay(a));
  const [longest, ...rest] = sorted;
  const restDays = rest.map(peakDay);
  const others = rest.length === 1 ? `${displayName(rest[0].name)} peaked on day ${restDays[0]}` : `the others peaked between day ${Math.min(...restDays)} and day ${Math.max(...restDays)}`;
  // Games still near their peak are named; the rest are summarised as a range.
  const pctOf = (g: CompareGame) => (100 * g.latest.r7) / g.peak.r7;
  const fmtP = (p: number) => (p < 1 ? "under 1%" : `${Math.round(p)}%`);
  const names = (list: CompareGame[]) => list.map((g) => displayName(g.name)).join(" and ");
  const atPeak = dated.filter((g) => pctOf(g) >= 95);
  const below = dated.filter((g) => pctOf(g) < 95).map(pctOf);
  const parts: string[] = [];
  if (atPeak.length) parts.push(`${names(atPeak)} ${atPeak.length === 1 ? "is still at its peak" : "are still at their peaks"}`);
  if (below.length === 1) parts.push(`${names(dated.filter((g) => pctOf(g) < 95))} is at ${fmtP(below[0])} of its peak`);
  else if (below.length > 1) {
    const lo = Math.min(...below);
    const hi = Math.max(...below);
    const range = Math.round(lo) === Math.round(hi) && lo >= 1 ? fmtP(lo) : `between ${fmtP(lo)} and ${fmtP(hi)}`;
    parts.push(`${atPeak.length ? "the others are" : "they are"} at ${range} of their peaks`);
  }
  return `${displayName(longest.name)} kept climbing longest, to day ${peakDay(longest)}, while ${others}. By their latest readings, ${parts.join(", and ")}.`;
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const align: Align = first(sp.align) === "date" ? "date" : "created";
  const scale: Scale = first(sp.scale) === "players" ? "players" : "pct";
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const db = getSiteDb();

  if (!db) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Compare launches</h1>
        <p className="mt-4 text-text-2">Compare is temporarily unavailable. Please try again shortly.</p>
      </main>
    );
  }

  const asked = parseIds(sp.ids);
  const ids = sp.ids === undefined ? await defaultCompareIds(db) : asked;
  const query = parseSearch(q);
  const [games, hits] = await Promise.all([getCompareGames(db, ids), query ? searchGames(db, query, 8) : Promise.resolve([] as SearchHit[])]);
  const shownIds = games.map((g) => g.universeId);
  const icons = await getGameIcons([...shownIds, ...hits.map((h) => h.universeId)]);

  const series: LineSeries[] = games.flatMap((g, i) => {
    if (align === "created" && g.createdMs === null) return [];
    const xOf = (dayMs: number) => (align === "created" ? daysSince(g.createdMs, dayMs)! : dayMs);
    const yOf = (v: number) => (scale === "pct" ? v / g.peak.r7 : v);
    return [
      {
        id: String(g.universeId),
        label: displayName(g.name),
        color: COMPARE_COLORS[i],
        emphasis: i === 0,
        points: g.points.map((p) => [xOf(p.dayMs), yOf(p.r7)] as [number, number]),
        peak: [xOf(g.peak.dayMs), yOf(g.peak.r7)] as [number, number],
      },
    ];
  });
  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const yTop = scale === "pct" ? { max: 1, step: 0.25 } : niceMax(Math.max(...series.flatMap((s) => s.points.map((p) => p[1])), 1));
  const sizes = games.map((g) => g.peak.r7);
  const ratio = sizes.length > 1 ? Math.round(Math.max(...sizes) / Math.min(...sizes)) : 1;
  const summary = `Launch curves, ${align === "created" ? "by days since creation" : "by date"}${scale === "pct" ? ", as a share of each game's own peak" : ""}. ${games
    .map((g) => `${displayName(g.name)} peaked at ${fmtInt(g.peak.r7)} on ${fmtDay(g.peak.dayMs)} and is at ${Math.round((100 * g.latest.r7) / g.peak.r7)}% of that.`)
    .join(" ")}`;
  const note = takeaway(games);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-16 pt-9 md:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Compare launches</h1>
        <p className="max-w-2xl text-text-2">
          Line up any games by the day they were created, to see whether a new launch is tracking like the last big hit or fading like most.
        </p>
      </header>

      <section aria-label="Games being compared" className="flex flex-wrap items-center gap-2.5">
        {games.map((g, i) => {
          const name = displayName(g.name);
          return (
            <span key={g.universeId} className="inline-flex items-center gap-2.5 rounded-[14px] border border-border bg-card py-1.5 pl-1.5 pr-1">
              <GameIcon url={icons.get(g.universeId)} name={name} size={32} />
              <span aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ background: COMPARE_COLORS[i] }} />
              <Link href={`/games/${g.universeId}`} className="font-medium hover:text-link">
                {name}
              </Link>
              <Link
                href={href(shownIds.filter((id) => id !== g.universeId), align, scale)}
                scroll={false}
                aria-label={`Remove ${name}`}
                className="flex size-8 items-center justify-center rounded-lg text-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                ×
              </Link>
            </span>
          );
        })}
        {games.length < MAX_COMPARE ? (
          <form action="/compare" method="get" role="search" className="flex flex-wrap gap-2">
            <input type="hidden" name="ids" value={shownIds.join(",")} />
            {align !== "created" ? <input type="hidden" name="align" value={align} /> : null}
            {scale !== "pct" ? <input type="hidden" name="scale" value={scale} /> : null}
            <label htmlFor="compare-add" className="sr-only">
              Add a game
            </label>
            <input
              id="compare-add"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="+ Add a game: name, ID or link"
              className="h-[46px] w-64 rounded-[14px] border border-dashed border-input bg-transparent px-4 text-sm outline-none placeholder:text-text-2 focus:border-ring"
            />
          </form>
        ) : (
          <span className="text-[13px] text-muted-foreground">Up to {MAX_COMPARE} games. Remove one to add another.</span>
        )}
      </section>

      {q ? (
        <section aria-label="Games to add" className="rounded-2xl border border-border bg-card p-4">
          {hits.length === 0 ? (
            <p className="text-sm text-text-2">No tracked games match &ldquo;{q}&rdquo;.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {hits.map((h) => {
                const name = displayName(h.name);
                const added = shownIds.includes(h.universeId);
                return (
                  <li key={h.universeId}>
                    <Link
                      href={added ? href(shownIds, align, scale) : href([...shownIds, h.universeId], align, scale)}
                      scroll={false}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2"
                    >
                      <GameIcon url={icons.get(h.universeId)} name={name} size={32} />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <span className="text-[13px] text-muted-foreground">{h.cur7 === null ? "not seen this week" : `${fmtInt(h.cur7)} players`}</span>
                      <span className="text-sm font-medium text-link">{added ? "Added" : "Add"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {series.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-text-2">Add a game to see its launch curve.</p>
      ) : (
        <>
          <section aria-labelledby="curves" className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-6 pb-5 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="curves" className="font-heading text-[22px] font-bold">
                {scale === "pct" ? "7-day average players, as % of each game's own peak" : "7-day average players"}
              </h2>
              <div className="flex flex-wrap gap-2">
                <Toggle
                  label="Align by"
                  value={align}
                  options={[
                    ["created", "Days since creation"],
                    ["date", "Calendar date"],
                  ]}
                  link={(v) => href(shownIds, v, scale)}
                />
                <Toggle
                  label="Scale"
                  value={scale}
                  options={[
                    ["pct", "% of peak"],
                    ["players", "Players"],
                  ]}
                  link={(v) => href(shownIds, align, v)}
                />
              </div>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-text-2" aria-label="Legend">
              {series.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-[3px] w-4 rounded" style={{ background: s.color }} />
                  {s.label}
                </li>
              ))}
            </ul>
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <LineChart
                  series={series}
                  xKind={align === "created" ? "day" : "date"}
                  yKind={scale === "pct" ? "pct" : "count"}
                  xMin={Math.min(...xs)}
                  xMax={Math.max(...xs)}
                  yMax={yTop.max}
                  yStep={yTop.step}
                  summary={summary}
                />
              </div>
            </div>
            <p className="text-[13px] text-muted-foreground">
              {scale === "pct" && ratio > 1 ? `Shown as a share of each game's own peak because their sizes differ ${fmtInt(ratio)}-fold. ` : ""}
              Lines start on the first day we have readings for each game. Dots mark each peak. Gaps are days with no readings.
            </p>
          </section>

          <section aria-labelledby="side" className="flex flex-col gap-3">
            <h2 id="side" className="font-heading text-[22px] font-bold">
              Side by side
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="pin w-full min-w-[880px] border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="text-right text-xs text-muted-foreground">
                    <th data-pin="" scope="col" className="px-4 py-3 text-left font-medium">Game</th>
                    <th scope="col" className="px-2 py-3 text-left font-medium">Genre</th>
                    <th scope="col" className="px-2 py-3 font-medium">Created</th>
                    <th scope="col" className="px-2 py-3 font-medium">First seen</th>
                    <th scope="col" className="px-2 py-3 font-medium">Peak 7-day avg</th>
                    <th scope="col" className="px-2 py-3 font-medium">Peaked on</th>
                    <th scope="col" className="px-2 py-3 font-medium">Latest</th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      <Link href="/methodology#revenue" className="hover:text-foreground" title="Top Earning rank, with modelled monthly payout">
                        Earning rank
                      </Link>
                    </th>
                  </tr>
                </thead>
                <tbody className="whitespace-nowrap text-right">
                  {games.map((g, i) => {
                    const d = (ms: number) => daysSince(g.createdMs, ms);
                    const day = (ms: number) => (d(ms) === null ? fmtDay(ms) : `day ${d(ms)}`);
                    return (
                      <tr key={g.universeId} className="border-t border-rule">
                        <th scope="row" className="px-4 py-3 text-left font-medium">
                          <span className="inline-flex items-center gap-2.5">
                            <span aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ background: COMPARE_COLORS[i] }} />
                            <Link href={`/games/${g.universeId}`} className="hover:text-link">
                              {displayName(g.name)}
                            </Link>
                          </span>
                        </th>
                        <td className="px-2 py-3 text-left">
                          <GenreChip genre={g.genre} />
                        </td>
                        <td className="px-2 py-3">{g.createdMs === null ? "—" : fmtDay(g.createdMs)}</td>
                        <td className="px-2 py-3">{day(g.firstDayMs)}</td>
                        <td className="px-2 py-3">{fmtInt(g.peak.r7)}</td>
                        <td className="px-2 py-3">{day(g.peak.dayMs)}</td>
                        <td className="px-2 py-3">
                          {Math.round((100 * g.latest.r7) / g.peak.r7)}% on {day(g.latest.dayMs)}
                        </td>
                        <td className="px-4 py-3">
                          {g.earningRank === null ? (
                            <span className="text-muted-foreground">not listed</span>
                          ) : (
                            <>
                              #{g.earningRank}{" "}
                              <span className="text-muted-foreground">
                                <Usd rank={g.earningEffRank} prefix="est. " suffix="/mo" />
                              </span>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sp.ids === undefined ? (
              <p className="text-[13px] text-muted-foreground">
                Showing the four biggest launches we tracked from their first weeks. Remove them or add your own; the link keeps your choice.
              </p>
            ) : null}
          </section>

          {note ? (
            <section className="flex gap-3 rounded-2xl border border-rise/35 bg-rise/8 px-5 py-4">
              <svg width="18" height="18" viewBox="0 0 12 12" aria-hidden="true" className="mt-0.5 flex-none">
                <polygon points="6,0.8 7.6,4.3 11.4,4.6 8.5,7.1 9.4,10.9 6,8.9 2.6,10.9 3.5,7.1 0.6,4.6 4.4,4.3" fill="var(--gold)" />
              </svg>
              <p className="text-text-soft">
                <strong className="text-foreground">Takeaway:</strong> {note}
              </p>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

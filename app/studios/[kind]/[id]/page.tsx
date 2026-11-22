import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getSiteDb } from "@/lib/db/site";
import { getCachedRevenuePage } from "@/lib/trends/cached";
import { getStudio, type TrackedGame } from "@/lib/trends/studio";
import { fmtUsdEstimate } from "@/lib/trends/revenue";
import { displayName } from "@/lib/trends/names";
import { getCreatorGames, type CreatorKind } from "@/lib/roblox/creators";
import { fmtCompact, fmtDay, fmtInt } from "@/lib/format";
import { niceMax } from "@/lib/stats";
import { LineChart } from "@/components/v2/LineChart";
import { GenreChip } from "@/components/v2/GenreChip";

// shortcut: revenue here is shown to everyone, not behind the Pro paywall (which is off); gate it before switching the paywall on.
export const revalidate = 3600;
export const maxDuration = 60;

export function generateStaticParams() {
  return [];
}

const COLORS = ["#4A8BE8", "#c98500", "#199e70", "#9085e9", "#DE667A", "#1FAAA4"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const fullDate = (ms: number) => `${fmtDay(ms)} ${new Date(ms).getUTCFullYear()}`;
const range = (low: number, high: number) => `${fmtUsdEstimate(low)} to ${fmtUsdEstimate(high)}`;

const parse = (kind: string, raw: string): { kind: CreatorKind; id: number } | null => {
  if ((kind !== "group" && kind !== "user") || !/^\d{1,20}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? { kind, id } : null;
};

const loadStudio = cache(async (kind: CreatorKind, id: number) => {
  const db = getSiteDb();
  const [revenue, roblox] = await Promise.all([getCachedRevenuePage().catch(() => null), getCreatorGames(kind, id)]);
  const studio = db ? await getStudio(db, kind, id, revenue?.games ?? []).catch(() => null) : null;
  return { studio, roblox };
});

export async function generateMetadata({ params }: { params: Promise<{ kind: string; id: string }> }): Promise<Metadata> {
  const p = await params;
  const ok = parse(p.kind, p.id);
  if (!ok) return { title: "Studio not found: Roblox Pulse" };
  const { studio, roblox } = await loadStudio(ok.kind, ok.id);
  const name = roblox?.name ?? studio?.name ?? "Studio";
  return { title: `${name}: every game, players and estimated revenue · Roblox Pulse`, description: `Every public Roblox game by ${name}, with player history and modelled revenue by month.` };
}

function Tile({ label, value, hint }: { label: string; value: ReactNode; hint: ReactNode }) {
  return (
    <div className="flex-[1_1_150px] rounded-2xl border border-border bg-card px-5 py-4 sm:flex-[1_1_200px]">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-[24px] font-extrabold tracking-tight sm:text-[30px]">{value}</div>
      <div className="text-[13px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function MonthTable({ g }: { g: TrackedGame }) {
  const sourceNote = { rank: "from its Top Earning rank", players: "from its players", capped: "off the list: below its lowest rank" };
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="pin w-full min-w-[760px] border-collapse text-sm tabular-nums">
        <caption className="sr-only">{displayName(g.name)} by month: players and modelled revenue</caption>
        <thead>
          <tr className="text-right text-xs text-muted-foreground">
            <th data-pin="" scope="col" className="px-4 py-3 text-left font-medium">
              Month
            </th>
            <th scope="col" className="px-2 py-3 font-medium">Days of data</th>
            <th scope="col" className="px-2 py-3 font-medium">Average players</th>
            <th scope="col" className="px-2 py-3 font-medium">Peak</th>
            <th scope="col" className="px-2 py-3 font-medium">Est. revenue that month</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Estimated</th>
          </tr>
        </thead>
        <tbody className="text-right">
          {g.months.map((m) => (
            <tr key={m.month} className="border-t border-rule">
              <th scope="row" className="px-4 py-2.5 text-left font-medium">
                {monthLabel(m.month)}
              </th>
              <td className={`px-2 py-2.5 ${m.days < 15 ? "text-gold" : "text-text-2"}`}>{m.days}</td>
              <td className="px-2 py-2.5">{fmtInt(m.avg)}</td>
              <td className="px-2 py-2.5">{fmtInt(m.peak)}</td>
              <td className="whitespace-nowrap px-2 py-2.5 font-semibold">
                <>
                  {m.source === "rank" ? fmtUsdEstimate(m.est.mid) : m.source === "capped" && m.est.low === m.est.high ? `under ${fmtUsdEstimate(m.est.high)}` : range(m.est.low, m.est.high)}
                </>
              </td>
              <td className="px-4 py-2.5 text-left text-xs text-muted-foreground">{sourceNote[m.source]}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border">
            <th scope="row" colSpan={4} className="px-4 py-3 text-left font-semibold">
              Total since {fullDate(g.firstSeenMs)}
            </th>
            <td className="whitespace-nowrap px-2 py-3 text-right font-heading text-lg font-extrabold">
              <>{range(g.total.low, g.total.high)}</>
            </td>
            <td className="px-4 py-3 text-xs text-muted-foreground">central {fmtUsdEstimate(g.total.mid)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default async function StudioPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const p = await params;
  const ok = parse(p.kind, p.id);
  if (!ok) notFound();
  const { studio, roblox } = await loadStudio(ok.kind, ok.id);
  const tracked = studio?.tracked ?? [];
  if (!roblox && !tracked.length) notFound();

  const name = roblox?.name ?? studio?.name ?? "This studio";
  const publicGames = roblox?.games ?? [];
  const trackedIds = new Set(tracked.map((t) => t.universeId));
  const playingNow = publicGames.reduce((a, g) => a + (g.playing ?? 0), 0);
  const total = tracked.reduce((t, g) => ({ low: t.low + g.total.low, high: t.high + g.total.high }), { low: 0, high: 0 });
  const robloxHref = ok.kind === "group" ? `https://www.roblox.com/communities/${ok.id}` : `https://www.roblox.com/users/${ok.id}/profile`;

  // Facts for the cross-pattern question: did anything follow the biggest game?
  const lead = tracked[0];
  const notes: string[] = [];
  if (lead) {
    const drop = lead.cur7 !== null && lead.peak > 0 ? 1 - lead.cur7 / lead.peak : null;
    notes.push(
      `${displayName(lead.name)} peaked at ${fmtInt(lead.peak)} players on ${fullDate(lead.peakDayMs)}` +
        (lead.cur7 !== null ? ` and averages ${fmtInt(lead.cur7)} now${drop !== null && drop > 0.5 ? `, ${drop > 0.99 ? (drop * 100).toFixed(1) : Math.round(drop * 100)}% lower` : ""}.` : "."),
    );
    const after = publicGames.filter((g) => g.universeId !== lead.universeId && g.createdMs > lead.peakDayMs).sort((a, b) => a.createdMs - b.createdMs);
    if (!publicGames.length) notes.push("Roblox's list of this studio's games couldn't be reached just now.");
    else if (publicGames.length === 1) notes.push(`It is ${name}'s only public game: no sequel or spin-off from this ${ok.kind === "group" ? "group" : "account"}.`);
    else if (after.length)
      notes.push(
        `${after.length} of its other public games ${after.length === 1 ? "was" : "were"} created after that peak, starting with ${displayName(after[0].name)} on ${fullDate(after[0].createdMs)}` +
          `${after[0].playing !== null ? ` (${fmtInt(after[0].playing)} playing now)` : ""}.`,
      );
    else notes.push("None of its other public games was created after that peak.");
    notes.push("A sequel published under a different group or account can't be linked from public data.");
  }
  const yTop = niceMax(Math.max(1, ...(studio?.series ?? []).flatMap((s) => s.points.map((p) => p[1]))));
  const allPoints = (studio?.series ?? []).flatMap((s) => s.points.map((p) => p[0]));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-9 px-4 pb-16 pt-6 md:px-6">
      <header className="flex flex-col gap-3">
        <span className="text-[13px] text-muted-foreground">{ok.kind === "group" ? "Group" : "Developer"}</span>
        <h1 className="font-heading text-[clamp(36px,6vw,52px)] font-extrabold leading-[1.05] tracking-[-0.03em]">{name}</h1>
        <p className="max-w-[760px] text-base text-text-2">
          Every public game {name} has on Roblox, the ones we track with their player history, and what they are estimated to have earned month by
          month.{" "}
          <a href={robloxHref} className="text-link underline" rel="noopener">
            Open on Roblox
          </a>
        </p>
      </header>

      <section aria-label="Key figures" className="flex flex-wrap gap-3">
        <Tile label="Public games" value={roblox ? fmtInt(publicGames.length) : "—"} hint="on Roblox now" />
        <Tile label="Tracked here" value={fmtInt(tracked.length)} hint="reached the discovery lists, so have history" />
        <Tile label="Playing now" value={roblox ? fmtCompact(playingNow, 1) : "—"} hint="across its public games" />
        <Tile
          label="Est. revenue, tracked games"
          value={tracked.length ? <>{range(total.low, total.high)}</> : "—"}
          hint="since each was first tracked (modelled)"
        />
      </section>

      {notes.length ? (
        <section aria-labelledby="takeaways" className="flex flex-col gap-3 rounded-2xl border border-rise/35 bg-rise/8 px-6 py-5">
          <h2 id="takeaways" className="font-heading text-[22px] font-bold">
            What happened
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-text-soft">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {studio?.series.length ? (
        <section aria-labelledby="players" className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-6 pb-4 pt-5">
          <h2 id="players" className="font-heading text-[22px] font-bold">
            Players over time
          </h2>
          <LineChart
            series={studio.series.map((s, i) => ({ id: String(s.universeId), label: displayName(s.name), color: COLORS[i], points: s.points }))}
            xKind="date"
            yKind="count"
            xMin={Math.min(...allPoints)}
            xMax={Math.max(...allPoints)}
            yMax={yTop.max}
            yStep={yTop.step}
            height={260}
            maxGap={3 * 86_400_000}
            summary={`Average players a day for ${studio.series.map((s) => displayName(s.name)).join(", ")}.`}
          />
          <p className="text-[12.5px] text-muted-foreground">
            Gaps are days we have no reading: until 25 October a game was only read while it was in the discovery lists.
          </p>
        </section>
      ) : null}

      {publicGames.length ? (
        <section aria-labelledby="all" className="flex flex-col gap-3">
          <h2 id="all" className="font-heading text-[26px] font-bold tracking-[-0.02em]">
            Every public game
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="pin w-full min-w-[720px] border-collapse text-sm tabular-nums">
              <thead>
                <tr className="text-right text-xs text-muted-foreground">
                  <th data-pin="" scope="col" className="px-4 py-3 text-left font-medium">
                    Game
                  </th>
                  <th scope="col" className="px-2 py-3 font-medium">Created</th>
                  <th scope="col" className="px-2 py-3 font-medium">Last updated</th>
                  <th scope="col" className="px-2 py-3 font-medium">Visits</th>
                  <th scope="col" className="px-4 py-3 font-medium">Playing now</th>
                </tr>
              </thead>
              <tbody className="text-right">
                {publicGames.map((g) => (
                  <tr key={g.universeId} className="border-t border-rule">
                    <th scope="row" className="px-4 py-2.5 text-left font-medium">
                      {trackedIds.has(g.universeId) ? (
                        <Link href={`/games/${g.universeId}`} className="hover:text-link">
                          {displayName(g.name)}
                        </Link>
                      ) : (
                        <span>
                          {displayName(g.name)} <span className="text-xs font-normal text-muted-foreground">not tracked</span>
                        </span>
                      )}
                    </th>
                    <td className="whitespace-nowrap px-2 py-2.5 text-text-2">{fullDate(g.createdMs)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-text-2">{fullDate(g.updatedMs)}</td>
                    <td className="px-2 py-2.5">{fmtCompact(g.visits, 1)}</td>
                    <td className="px-4 py-2.5">{g.playing === null ? "—" : fmtInt(g.playing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tracked.map((g) => (
        <section key={g.universeId} aria-labelledby={`g${g.universeId}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`g${g.universeId}`} className="font-heading text-[26px] font-bold tracking-[-0.02em]">
              <Link href={`/games/${g.universeId}`} className="hover:text-link">
                {displayName(g.name)}
              </Link>{" "}
              by month
            </h2>
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <GenreChip genre={g.genre} link />
              {g.subgenre ?? ""}
            </span>
          </div>
          <MonthTable g={g} />
          <p className="text-[12.5px] text-muted-foreground">
            Months with few days of data (amber) rest on the days the game was in the discovery lists, so read them loosely. Without a Top Earning
            rank, a month is estimated from players: {displayName(g.name)}&apos;s average players times what {g.perPlayer.basis} games in the Top
            Earning list earn per player (${Math.round(g.perPlayer.p25)} to ${Math.round(g.perPlayer.p75)} a month, the middle half of{" "}
            {g.perPlayer.n} games). Tested on listed games, this lands within about a factor of two half the time, and listed games are the top
            earners, so it reads high for a game outside the list.
            {studio?.earningFrom ? ` Ranks are recorded from ${fullDate(Date.parse(studio.earningFrom))}.` : ""}
          </p>
        </section>
      ))}

      {!tracked.length ? (
        <p className="text-sm text-text-2">None of {name}&apos;s games has reached the discovery lists, so there is no player history for them here.</p>
      ) : null}

      <p className="text-[13px] text-muted-foreground">
        All revenue figures are modelled, not Roblox data.{" "}
        <Link href="/methodology#revenue" className="text-link underline">
          How we estimate revenue
        </Link>
      </p>
    </main>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getCachedUpdateImpact } from "@/lib/trends/cached";
import type { LiftSummary } from "@/lib/trends/updates";
import { MIN_PLAYERS } from "@/lib/trends/updates";
import { displayName } from "@/lib/trends/names";
import { genreColor } from "@/lib/trends/genres";
import { fmtDay, fmtInt, fmtPct } from "@/lib/format";
import { RangeBar } from "@/components/v2/RangeBar";

export const revalidate = 3600;
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Do updates bring players back? Roblox Pulse",
  description: "What happens to a Roblox game's players after an update, measured across thousands of games: by day of the week, by genre and update by update.",
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Shared scale for every bar, so rows compare directly.
const SCALE = { min: -0.4, max: 0.4 };
const pct = (x: number) => fmtPct(x * 100);

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex-[1_1_220px] rounded-2xl border border-border bg-card px-5 py-4">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-[34px] font-extrabold tracking-tight">{value}</div>
      <div className="text-[13px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function Change({ x }: { x: number }) {
  return <span className={x >= 0 ? "text-rise" : "text-fall"}>{pct(x)}</span>;
}

// One labelled row: the bar, its median and how often players rose.
function RangeTable({ rows, caption }: { rows: { key: string; label: ReactNode; s: LiftSummary }[]; caption: string }) {
  return (
    <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[720px] border-collapse text-sm tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-right text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-3 text-left font-medium" />
            <th scope="col" className="px-2 py-3 font-medium">Events</th>
            <th scope="col" className="px-2 py-3 font-medium">Median change</th>
            <th scope="col" className="px-2 py-3 font-medium">Rose</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">
              Middle half, {pct(SCALE.min)} to {pct(SCALE.max)}
            </th>
          </tr>
        </thead>
        <tbody className="whitespace-nowrap text-right">
          {rows.map(({ key, label, s }) => (
            <tr key={key} className="border-t border-[#1b2028]">
              <th scope="row" className="px-4 py-2.5 text-left font-medium">
                {label}
              </th>
              <td className="px-2 py-2.5 text-text-2">{fmtInt(s.events)}</td>
              <td className="px-2 py-2.5 font-semibold">
                <Change x={s.median} />
              </td>
              <td className="px-2 py-2.5">{Math.round(s.shareUp * 100)}%</td>
              <td className="px-4 py-2.5">
                <RangeBar
                  p25={s.p25}
                  p50={s.median}
                  p75={s.p75}
                  min={SCALE.min}
                  max={SCALE.max}
                  zero={0}
                  label={`Middle half ${pct(s.p25)} to ${pct(s.p75)}, median ${pct(s.median)}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function UpdatesPage() {
  const u = await getCachedUpdateImpact();
  if (!u || u.announced.events === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Do updates bring players back?</h1>
        <p className="mt-4 text-text-2">Update figures are temporarily unavailable. Please try again shortly.</p>
      </main>
    );
  }

  // From the rounded medians the tiles show, so the three tiles agree.
  const gap = Math.round(u.announced.median * 100) - Math.round(u.publishes.median * 100);
  const best = [...u.byWeekday].filter((w) => w.events >= 100).sort((a, b) => b.median - a.median)[0];
  const busiest = [...u.byWeekday].sort((a, b) => b.events - a.events)[0];
  const topGenre = u.byGenre[0];
  const bottomGenre = u.byGenre[u.byGenre.length - 1];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-9 md:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Do updates bring players back?</h1>
        <p className="max-w-3xl text-text-2">
          Every update to every game we track since {fmtDay(Date.parse(u.since))}, for games averaging {fmtInt(MIN_PLAYERS)}+ players. Each
          compares players on the two days after with the same two weekdays a week earlier, so the weekly rhythm cancels out.
        </p>
      </header>

      <section aria-label="Key figures" className="flex flex-wrap gap-3">
        <Tile
          label="Announced updates"
          value={pct(u.announced.median)}
          hint={`median change; ${Math.round(u.announced.shareUp * 100)}% of ${fmtInt(u.announced.events)} rose`}
        />
        <Tile
          label="Routine publishes"
          value={pct(u.publishes.median)}
          hint={`median change; ${Math.round(u.publishes.shareUp * 100)}% of ${fmtInt(u.publishes.events)} rose`}
        />
        <Tile
          label="Announcing it"
          value={`${gap > 0 ? "+" : gap < 0 ? "−" : ""}${Math.abs(gap)} pts`}
          hint="announced updates against routine publishes"
        />
        {best ? <Tile label="Best day to ship" value={WEEKDAYS[best.dow - 1]} hint={`median ${pct(best.median)} after an announced update`} /> : null}
      </section>

      <section aria-labelledby="kinds" className="flex flex-col gap-3">
        <h2 id="kinds" className="font-heading text-[28px] font-bold tracking-tight">
          Announced updates against routine publishes
        </h2>
        <p className="max-w-3xl text-[13px] text-muted-foreground">
          A routine publish is any time Roblox&apos;s &ldquo;last updated&rdquo; changes, which includes small fixes. An announced update is a new
          tag in the game&apos;s title, the way studios advertise an update or event (&ldquo;[UPD 21]&rdquo;, &ldquo;[🎃 HALLOWEEN]&rdquo;);
          countdown tags such as &ldquo;[8H⏳]&rdquo; are left out. Most games drift down week to week, so a median below zero is the norm.
        </p>
        <RangeTable
          caption="Change in players after updates, by kind"
          rows={[
            { key: "announced", label: "Announced updates", s: u.announced },
            { key: "publishes", label: "Routine publishes", s: u.publishes },
          ]}
        />
      </section>

      <section aria-labelledby="weekday" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="weekday" className="font-heading text-[28px] font-bold tracking-tight">
            Which day to ship
          </h2>
          <span className="text-[13px] text-muted-foreground">announced updates, by the UTC day they appeared</span>
        </div>
        <RangeTable
          caption="Change in players after announced updates, by weekday"
          rows={u.byWeekday.map((w) => ({ key: String(w.dow), label: WEEKDAYS[w.dow - 1], s: w }))}
        />
        {best && busiest ? (
          <p className="text-[13px] text-muted-foreground">
            Most announced updates go out on {WEEKDAYS[busiest.dow - 1]} ({fmtInt(busiest.events)}); {WEEKDAYS[best.dow - 1]} updates hold up best.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="genre" className="flex flex-col gap-3">
        <h2 id="genre" className="font-heading text-[28px] font-bold tracking-tight">
          By genre
        </h2>
        <RangeTable
          caption="Change in players after announced updates, by genre"
          rows={u.byGenre.map((g) => ({
            key: g.genre,
            label: (
              <Link href={`/explore?launched=any&genre=${encodeURIComponent(g.genre)}`} className="inline-flex items-center gap-2 hover:text-link">
                <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: genreColor(g.genre) }} />
                {g.genre}
              </Link>
            ),
            s: g,
          }))}
        />
        {topGenre && bottomGenre && topGenre !== bottomGenre ? (
          <p className="text-[13px] text-muted-foreground">
            {topGenre.genre} updates do best ({pct(topGenre.median)} median); {bottomGenre.genre} updates do worst ({pct(bottomGenre.median)}).
            Genres with fewer than 30 announced updates are left out.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="recent" className="flex flex-col gap-3">
        <h2 id="recent" className="font-heading text-[28px] font-bold tracking-tight">
          Latest announced updates
        </h2>
        <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[860px] border-collapse text-sm tabular-nums">
            <thead>
              <tr className="text-right text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 text-left font-medium">Game</th>
                <th scope="col" className="px-2 py-3 text-left font-medium">Title change</th>
                <th scope="col" className="px-2 py-3 font-medium">Seen</th>
                <th scope="col" className="px-2 py-3 font-medium">Players the week before</th>
                <th scope="col" className="px-4 py-3 font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="text-right">
              {u.recent.slice(0, 25).map((r) => (
                <tr key={`${r.universeId}-${r.dayMs}`} className="border-t border-[#1b2028]">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">
                    <Link href={`/games/${r.universeId}`} className="hover:text-link">
                      {displayName(r.name)}
                    </Link>
                  </th>
                  <td className="max-w-[360px] px-2 py-2.5 text-left text-xs text-text-2">
                    <span className="line-through decoration-muted-foreground/60">{r.prevName}</span>
                    <span aria-hidden="true"> → </span>
                    <span className="sr-only"> became </span>
                    <span className="text-foreground">{r.name}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-text-2">{fmtDay(r.dayMs)}</td>
                  <td className="px-2 py-2.5">{fmtInt(r.before)}</td>
                  <td className="px-4 py-2.5 font-semibold">
                    <Change x={r.lift} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside aria-label="Note on calculation" className="rounded-2xl border border-border bg-card p-5 text-[13px] text-text-2">
        <h2 className="font-heading text-lg font-bold text-foreground">Note on calculation</h2>
        <p className="mt-2">
          Change is average players on the two UTC days after the event divided by the same two weekdays a week earlier, minus one. Several
          publishes or tag changes on one day count once. A title change only counts when we saw the game within 36 hours before, so its date
          is known. Updates are correlated with everything else a studio does (ads, events, seasons), so this describes what follows an update,
          not what an update causes.{" "}
          <Link href="/methodology" className="text-link underline">
            How we measure
          </Link>
        </p>
      </aside>
    </main>
  );
}

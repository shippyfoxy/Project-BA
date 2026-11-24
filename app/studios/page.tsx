import type { Metadata } from "next";
import Link from "next/link";
import { CsvButton } from "@/components/v2/CsvButton";
import { getCachedStudios } from "@/lib/trends/cached";
import { STUDIO_HIT, type StudioRow } from "@/lib/trends/studios";
import { fmtUsdEstimate } from "@/lib/trends/revenue";
import { displayName } from "@/lib/trends/names";
import { fmtInt } from "@/lib/format";

export const revalidate = 3600;
export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Roblox studios: who earns and who keeps making hits · Roblox Pulse",
  description: "Roblox groups and developers ranked by estimated revenue, players now and how many hits they have made.",
};

// shortcut: revenue here is shown to everyone, not behind the Pro paywall (which is off); gate it before switching the paywall on.
const SORTS: Record<string, { label: string; by: (a: StudioRow, b: StudioRow) => number }> = {
  revenue: { label: "Estimated revenue", by: (a, b) => b.estMonthly - a.estMonthly || b.players - a.players },
  players: { label: "Players now", by: (a, b) => b.players - a.players },
  hits: { label: "Hits made", by: (a, b) => b.hits - a.hits || b.players - a.players },
};
const SHOW = 100;

export default async function StudiosPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const sortKey = (await searchParams).sort ?? "revenue";
  const sort = SORTS[sortKey] ?? SORTS.revenue;
  const all = await getCachedStudios().catch(() => [] as StudioRow[]);
  const rows = [...all].sort(sort.by).slice(0, SHOW);
  const repeat = all.filter((s) => s.hits >= 2).length;
  const withHit = all.filter((s) => s.hits >= 1).length;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-9 md:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Studios</h1>
        <p className="max-w-2xl text-text-2">
          Roblox groups and developers behind the games we track: what their games earn, how many play them now, and who keeps making hits.
        </p>
      </header>

      {all.length ? (
        <>
          <section aria-label="Key figures" className="flex flex-wrap gap-3">
            {[
              ["Studios", fmtInt(all.length), "with a game that reached the discovery lists"],
              ["Made a hit", fmtInt(withHit), `a best week of ${fmtInt(STUDIO_HIT)}+ players`],
              ["Made two or more", fmtInt(repeat), withHit ? `${Math.round((100 * repeat) / withHit)}% of studios with a hit` : ""],
            ].map(([label, value, hint]) => (
              <div key={label} className="flex-[1_1_200px] rounded-2xl border border-border bg-card px-5 py-4">
                <div className="text-[13px] text-muted-foreground">{label}</div>
                <div className="mt-1 font-heading text-[30px] font-extrabold tracking-tight">{value}</div>
                <div className="text-[13px] text-muted-foreground">{hint}</div>
              </div>
            ))}
          </section>

          <section aria-labelledby="board" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="board" className="font-heading text-2xl font-bold">
                Top {SHOW} by {sort.label.toLowerCase()}
              </h2>
              <nav aria-label="Sort by" className="flex items-center gap-1 text-[13px]">
                <CsvButton table="studios" file={`roblox-studios-by-${sortKey}`} />
                {Object.entries(SORTS).map(([k, s]) => (
                  <Link
                    key={k}
                    href={k === "revenue" ? "/studios" : `/studios?sort=${k}`}
                    aria-current={k === sortKey || (!SORTS[sortKey] && k === "revenue") ? "page" : undefined}
                    className="rounded-full px-3 py-1 text-text-2 hover:bg-secondary aria-[current=page]:bg-secondary aria-[current=page]:text-foreground"
                  >
                    {s.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
              <table id="studios" className="pin w-full min-w-[860px] border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="text-right text-xs text-muted-foreground">
                    <th scope="col" className="px-3 py-3 font-medium">#</th>
                    <th data-pin="" scope="col" className="px-2 py-3 text-left font-medium">Studio</th>
                    <th scope="col" className="px-2 py-3 font-medium">Est. per month</th>
                    <th scope="col" className="px-2 py-3 font-medium">In Top Earning</th>
                    <th scope="col" className="px-2 py-3 font-medium">Players now</th>
                    <th scope="col" className="px-2 py-3 font-medium">Games</th>
                    <th scope="col" className="px-2 py-3 font-medium">Hits</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Biggest now</th>
                  </tr>
                </thead>
                <tbody className="whitespace-nowrap text-right">
                  {rows.map((s, i) => (
                    <tr key={`${s.kind}:${s.id}`} className="border-t border-rule">
                      <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                      <th scope="row" className="max-w-[240px] truncate px-2 py-2.5 text-left font-medium">
                        <Link href={`/studios/${s.kind}/${s.id}`} className="hover:text-link">
                          {s.name}
                        </Link>
                        {s.kind === "user" ? <span className="ml-2 text-xs font-normal text-muted-foreground">solo</span> : null}
                      </th>
                      <td className="px-2 py-2.5">{s.estMonthly ? fmtUsdEstimate(s.estMonthly) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2 py-2.5">{s.earners || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2 py-2.5">{fmtInt(s.players)}</td>
                      <td className="px-2 py-2.5">{fmtInt(s.games)}</td>
                      <td className={`px-2 py-2.5 ${s.hits >= 2 ? "font-semibold text-foreground" : ""}`}>{fmtInt(s.hits)}</td>
                      <td className="max-w-[260px] truncate px-4 py-2.5 text-left text-text-2">
                        {s.top ? (
                          <Link href={`/games/${s.top.universeId}`} className="hover:text-link">
                            {displayName(s.top.name)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Estimated revenue is modelled from Top Earning ranks and summed over a studio&apos;s listed games (
              <Link href="/methodology#revenue" className="text-link underline">
                how
              </Link>
              ). Games and hits count only games that reached the discovery lists; a hit is a best week of {fmtInt(STUDIO_HIT)}+ players. Players
              now is the last 7 days&apos; average, summed. A studio publishing under several groups shows as several rows.
            </p>
          </section>
        </>
      ) : (
        <p className="text-text-2">Studios are temporarily unavailable. Please try again shortly.</p>
      )}
    </main>
  );
}

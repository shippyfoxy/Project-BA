import Link from "next/link";
import { HIT_MIN, type GenreIdea, type Momentum } from "@/lib/trends/ideas";
import { fmtCompact, fmtInt } from "@/lib/format";
import { GenreChip } from "@/components/v2/GenreChip";
import { UsdSum } from "@/components/pro/Pro";

export const MOMENTUM_LABEL: Record<Momentum, string> = { rising: "Rising", crowding: "Crowding in", steady: "Steady", fading: "Fading" };
const MOMENTUM_CLASS: Record<Momentum, string> = {
  rising: "bg-rise/15 text-rise",
  crowding: "bg-gold/18 text-foreground",
  steady: "bg-secondary text-text-2",
  fading: "bg-fall/15 text-fall",
};

export const pts = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x * 100))} pts`;

export function MomentumChip({ m }: { m: Momentum }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${MOMENTUM_CLASS[m]}`}>{MOMENTUM_LABEL[m]}</span>;
}

// Hit rate as a small bar: how many of the last month's new games reached
// 1,000 players.
export function HitBar({ hits, launches }: { hits: number; launches: number }) {
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

// Roblox's subgenres with their players, momentum and launch odds; shared by
// Ideas and the genre pages.
export function SubgenreTable({ rows, showParent = true }: { rows: GenreIdea[]; showParent?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="pin w-full min-w-[960px] border-collapse text-sm tabular-nums">
        <caption className="sr-only">Subgenres by players, momentum, new games and modelled revenue</caption>
        <thead>
          <tr className="text-right text-xs text-muted-foreground">
            <th data-pin="" scope="col" className="px-4 py-3 text-left font-medium">
              Subgenre
            </th>
            <th scope="col" className="px-2 py-3 text-left font-medium">
              Momentum
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
          {rows.map((s) => (
            <tr key={s.genre} className="border-t border-rule hover:bg-surface-2">
              <th scope="row" className="px-4 py-2.5 text-left font-medium">
                <Link href={`/explore?launched=any&sub=${encodeURIComponent(s.genre)}`} className="hover:text-link">
                  {s.genre}
                </Link>
                {showParent && s.parent ? (
                  <span className="mt-1 block font-normal">
                    <GenreChip genre={s.parent} link />
                  </span>
                ) : null}
              </th>
              <td className="px-2 py-2.5 text-left">
                <MomentumChip m={s.momentum} />
              </td>
              <td className="px-2 py-2.5">{fmtInt(s.games)}</td>
              <td className="px-2 py-2.5">{fmtCompact(s.players, 1)}</td>
              <td className={`px-2 py-2.5 font-semibold ${s.vsMarket === null ? "" : s.vsMarket >= 0 ? "text-rise" : "text-fall"}`}>
                {s.vsMarket === null ? "—" : pts(s.vsMarket)}
              </td>
              <td className="px-2 py-2.5">{fmtInt(s.median)}</td>
              <td className="whitespace-nowrap px-2 py-2.5 text-left">
                <HitBar hits={s.hits} launches={s.launches} />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5">{s.earners ? <UsdSum ranks={s.earnerRanks} suffix="/mo" /> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

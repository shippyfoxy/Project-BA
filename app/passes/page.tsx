import type { Metadata } from "next";
import Link from "next/link";
import { CsvButton } from "@/components/v2/CsvButton";
import { GenreChip } from "@/components/v2/GenreChip";
import { getCachedPassPricing } from "@/lib/trends/cached";
import { CREATOR_USD_PER_ROBUX, PASS_MIN_PLAYERS, type PassGroup } from "@/lib/trends/passes";
import { fmtInt } from "@/lib/format";

export const revalidate = 3600;
export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Roblox game pass prices by subgenre · Roblox Pulse",
  description: "What Roblox games charge for game passes, by subgenre: median prices, the most used price points and what passes sell.",
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const robux = (v: number) => fmtInt(Math.round(v));
const creator = (v: number) => {
  const usd = v * CREATOR_USD_PER_ROBUX;
  return usd < 1 ? `${Math.round(usd * 100)}c` : `$${usd.toFixed(2)}`;
};

function Row({ g }: { g: PassGroup }) {
  return (
    <tr className="border-t border-rule">
      <th scope="row" className="px-4 py-2.5 text-left font-medium">
        <span className="flex items-center gap-2">
          <GenreChip genre={g.genre} link />
          {g.subgenre}
        </span>
      </th>
      <td className="px-2 py-2.5">{fmtInt(g.games)}</td>
      <td className="px-2 py-2.5">{pct(g.withPasses)}</td>
      <td className="px-2 py-2.5">{g.passesPerGame === null ? "—" : fmtInt(g.passesPerGame)}</td>
      <td className="px-2 py-2.5 font-semibold">{g.price ? robux(g.price.median) : "—"}</td>
      <td className="px-2 py-2.5 text-text-2">{g.price ? `${robux(g.price.p25)} to ${robux(g.price.p75)}` : "—"}</td>
      <td className="px-2 py-2.5 text-text-2">{g.price ? g.price.common.map((c) => robux(c.price)).join(", ") : "—"}</td>
      <td className="px-4 py-2.5">{g.earnerMedian === null ? <span className="text-muted-foreground">—</span> : robux(g.earnerMedian)}</td>
    </tr>
  );
}

export default async function PassesPage() {
  const data = await getCachedPassPricing().catch(() => null);
  const all = data?.all;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-9 md:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Game passes</h1>
        <p className="max-w-2xl text-text-2">
          What Roblox games charge for game passes, by subgenre. Roblox lists every pass and its price but hides how many sell, so this is
          pricing, not sales: what games with {fmtInt(PASS_MIN_PLAYERS)}+ players settle on.
        </p>
      </header>

      {!data || !all?.price ? (
        <p className="text-text-2">Game pass prices are still being read. Each game is read once a day, so check back in a few hours.</p>
      ) : (
        <>
          <section aria-label="Key figures" className="flex flex-wrap gap-3">
            {[
              ["Games read", fmtInt(data.games), `averaging ${fmtInt(PASS_MIN_PLAYERS)}+ players this week`],
              ["Sell passes", pct(all.withPasses), all.passesPerGame === null ? "" : `usually ${fmtInt(all.passesPerGame)} each`],
              ["Median price", `${robux(all.price.median)} Robux`, `about ${creator(all.price.median)} to the creator per sale`],
              ["Top earners' median", all.earnerMedian === null ? "—" : `${robux(all.earnerMedian)} Robux`, `${fmtInt(all.earners)} games in the Top Earning list`],
            ].map(([label, value, hint]) => (
              <div key={label} className="flex-[1_1_200px] rounded-2xl border border-border bg-card px-5 py-4">
                <div className="text-[13px] text-muted-foreground">{label}</div>
                <div className="mt-1 font-heading text-[30px] font-extrabold tracking-tight">{value}</div>
                <div className="text-[13px] text-muted-foreground">{hint}</div>
              </div>
            ))}
          </section>
          <p className="-mt-3 text-[13px] text-muted-foreground">
            The most used prices are {all.price.common.map((c) => `${robux(c.price)} (${pct(c.share)})`).join(", ")}. A quarter of passes cost
            under {robux(all.price.p25)} Robux and a quarter {robux(all.price.p75)} or more.
          </p>

          <section aria-labelledby="by-subgenre" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="by-subgenre" className="font-heading text-2xl font-bold">
                By subgenre
              </h2>
              <CsvButton table="pass-subgenres" file="roblox-game-pass-prices-by-subgenre" />
            </div>
            <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
              <table id="pass-subgenres" className="w-full min-w-[920px] border-collapse text-sm tabular-nums">
                <caption className="sr-only">Game pass prices in Robux by subgenre</caption>
                <thead>
                  <tr className="text-right text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-3 text-left font-medium">Subgenre</th>
                    <th scope="col" className="px-2 py-3 font-medium">Games</th>
                    <th scope="col" className="px-2 py-3 font-medium">Sell passes</th>
                    <th scope="col" className="px-2 py-3 font-medium">Passes each</th>
                    <th scope="col" className="px-2 py-3 font-medium">Median price</th>
                    <th scope="col" className="px-2 py-3 font-medium">Middle half</th>
                    <th scope="col" className="px-2 py-3 font-medium">Most used prices</th>
                    <th scope="col" className="px-4 py-3 font-medium">Top earners&apos; median</th>
                  </tr>
                </thead>
                <tbody className="whitespace-nowrap text-right">
                  {data.subgenres.map((g) => (
                    <Row key={`${g.genre}|${g.subgenre}`} g={g} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Prices in Robux. Subgenres with at least 5 games read; passes each is the median among games that sell any. Top earners&apos;
              median covers games in today&apos;s Top Earning list, where 3 or more in the subgenre sell passes.
            </p>
          </section>

          <section aria-labelledby="kinds" className="flex flex-col gap-3">
            <h2 id="kinds" className="font-heading text-2xl font-bold">
              What passes sell
            </h2>
            <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
              <table id="pass-kinds" className="w-full min-w-[480px] border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="text-right text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-3 text-left font-medium">Kind of pass</th>
                    <th scope="col" className="px-2 py-3 font-medium">Games selling one</th>
                    <th scope="col" className="px-4 py-3 font-medium">Median price</th>
                  </tr>
                </thead>
                <tbody className="text-right">
                  {data.kinds.map((k) => (
                    <tr key={k.kind} className="border-t border-rule">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium">
                        {k.kind}
                      </th>
                      <td className="px-2 py-2.5">{pct(k.games)}</td>
                      <td className="px-4 py-2.5">{robux(k.median)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Guessed from each pass&apos;s name (&quot;2x Coins&quot; counts as double, &quot;VIP Room&quot; as VIP), so a pass can count twice
              and oddly named ones are missed.
            </p>
          </section>

          <p className="text-[13px] text-muted-foreground">
            Each game&apos;s passes are read once a day; these are from reads since {data.readFrom}. A creator keeps 70% of the price, paid out at
            $0.0038 a Robux, so 100 Robux is about 27c to the creator.{" "}
            <Link href="/methodology#passes" className="text-link underline">
              How this is measured
            </Link>
          </p>
        </>
      )}
    </main>
  );
}

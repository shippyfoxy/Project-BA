import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getSiteDb } from "@/lib/db/site";
import { getSparklines } from "@/lib/trends/home";
import { displayName } from "@/lib/trends/names";
import { DEVICE_LABELS } from "@/lib/trends/labels";
import { STAGES } from "@/lib/trends/stage";
import {
  ageDays,
  COUNTRIES,
  DEVICES,
  filtersToQuery,
  parseFilters,
  screenGames,
  PAGE_SIZE,
  type Launched,
  type ScreenerFilters,
  type ScreenerResult,
  type SortKey,
} from "@/lib/trends/screener";
import { COUNTRY_NAMES } from "@/lib/snapshot/aggregate";
import { getGameIcons } from "@/lib/roblox/thumbnails";
import { fmtDay, fmtInt, fmtPct } from "@/lib/format";
import { ApplyButton, AutoSubmitForm } from "@/components/v2/AutoSubmitForm";
import { GameIcon } from "@/components/v2/GameIcon";
import { GenreChip } from "@/components/v2/GenreChip";
import { Sparkline } from "@/components/v2/Sparkline";
import { StageBadge, stageLabel } from "@/components/v2/StageBadge";

export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Explore: Roblox Pulse",
  description: "Filter every Roblox game tracked this week by launch date, players, genre, lifecycle stage, country and device.",
};

const FORM_ID = "screener";
const DAY_MS = 86_400_000;

const LAUNCHED_LABELS: Record<Launched, string> = {
  "30": "Last 30 days",
  "60": "Last 60 days",
  "90": "Last 90 days",
  "365": "Last year",
  any: "Any time",
};
const MIN_LABELS: [number, string][] = [
  [0, "Any"],
  [100, "100+"],
  [1_000, "1,000+"],
  [10_000, "10,000+"],
  [100_000, "100,000+"],
];
const SORT_LABELS: Record<SortKey, string> = {
  players: "7-day average players",
  wow: "Week on week",
  session: "Estimated session",
  favs: "Favourites per 1k visits",
  newest: "Newest",
};

const PRESETS: { label: string; href: string }[] = [
  { label: "New hits: launched in 60 days, 10k+ players", href: "/explore?launched=60&min=10000" },
  { label: "Breakouts", href: "/explore?stage=breakout" },
  { label: "Rising this week", href: "/explore?launched=any&min=1000&stage=rising&sort=wow" },
  { label: "Long sessions", href: "/explore?launched=any&min=1000&sort=session" },
  { label: "Fading", href: "/explore?launched=any&min=1000&stage=fading" },
];

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ExplorePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const f = parseFilters(await searchParams);
  const db = getSiteDb();

  let result: ScreenerResult | null = null;
  if (db) {
    try {
      result = await screenGames(db, f);
    } catch (err) {
      console.error("[explore] screen failed:", err);
    }
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pb-16 pt-9 md:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Explore</h1>
        <p className="max-w-2xl text-text-2">
          Filter every game we&apos;ve seen this week, or search all of them by name, studio, universe ID or a pasted Roblox link.
        </p>
      </header>

      <form action="/explore" method="get" role="search" className="flex max-w-2xl flex-wrap gap-2">
        <label htmlFor="explore-search" className="sr-only">
          Search games
        </label>
        <input
          id="explore-search"
          name="q"
          type="search"
          defaultValue={f.q}
          placeholder="e.g. Steal An Egg, Uplift Games, 10563114921"
          className="h-[52px] min-w-0 flex-[1_1_320px] rounded-[14px] border border-input bg-card px-4 text-[15px] outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <button type="submit" className="h-[52px] rounded-[14px] bg-rise px-6 font-bold text-background hover:brightness-110">
          Search
        </button>
      </form>

      <nav aria-label="Quick screens" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Quick screens:</span>
        {PRESETS.map((p) => (
          <Link key={p.href} href={p.href} className="rounded-full border border-input px-3 py-1.5 text-text-2 hover:text-foreground">
            {p.label}
          </Link>
        ))}
      </nav>

      {!db || !result ? (
        <p className="text-sm text-text-2">Explore is temporarily unavailable. Please try again shortly.</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div>
            {/* On small screens the panel hides behind a toggle; CSS only, so nothing jumps on load. */}
            <input id="show-filters" type="checkbox" className="peer sr-only" />
            <label
              htmlFor="show-filters"
              className="flex h-11 cursor-pointer items-center justify-between rounded-[12px] border border-input bg-card px-4 text-sm font-semibold peer-focus-visible:border-ring lg:hidden"
            >
              <span>Filters{activeCount(f) ? ` (${activeCount(f)} on)` : ""}</span>
              <span className="text-muted-foreground">Show or hide</span>
            </label>
            <div className="mt-3 hidden peer-checked:block lg:mt-0 lg:block">
              <Filters f={f} result={result} />
            </div>
          </div>
          <Results f={f} result={result} />
        </div>
      )}
    </main>
  );
}

function FieldSet({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[13px] font-semibold text-text-2">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Option({
  type,
  name,
  value,
  checked,
  label,
  count,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  label: ReactNode;
  count?: number;
}) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2.5 text-sm">
      <input type={type} name={name} value={value} defaultChecked={checked} className="size-4 accent-[var(--rise)]" />
      <span className="flex-1">{label}</span>
      {count !== undefined ? <span className="tabular-nums text-muted-foreground">{fmtInt(count)}</span> : null}
    </label>
  );
}

const selectClass = "h-10 rounded-[10px] border border-input bg-background px-3 text-sm";

function Filters({ f, result }: { f: ScreenerFilters; result: ScreenerResult }) {
  // Keep picked genres visible even when the other filters leave none of them.
  const genres = [...result.genreCounts];
  for (const g of f.genres) if (!genres.some(([name]) => name === g)) genres.push([g, 0]);

  return (
    <AutoSubmitForm
      id={FORM_ID}
      action="/explore"
      method="get"
      aria-label="Filters"
      className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">Filters</h2>
        <Link href="/explore" className="text-sm text-link hover:underline">
          Clear
        </Link>
      </div>
      {f.q ? <input type="hidden" name="q" value={f.q} /> : null}

      <FieldSet legend="Launched">
        {(Object.keys(LAUNCHED_LABELS) as Launched[]).map((l) => (
          <Option key={l} type="radio" name="launched" value={l} checked={f.launched === l} label={LAUNCHED_LABELS[l]} />
        ))}
      </FieldSet>

      <FieldSet legend="Minimum 7-day average players">
        {MIN_LABELS.map(([v, label]) => (
          <Option key={v} type="radio" name="min" value={v ? String(v) : ""} checked={f.min === v} label={label} />
        ))}
      </FieldSet>

      <FieldSet legend="Lifecycle stage">
        {STAGES.map((s) => (
          <Option
            key={s}
            type="checkbox"
            name="stage"
            value={s}
            checked={f.stages.includes(s)}
            label={stageLabel(s)}
            count={result.stageCounts[s]}
          />
        ))}
      </FieldSet>

      <FieldSet legend="Genre">
        {genres.length === 0 ? <p className="text-sm text-muted-foreground">No genres in these results.</p> : null}
        {genres.map(([g, n]) => (
          <Option key={g} type="checkbox" name="genre" value={g} checked={f.genres.includes(g)} label={<GenreChip genre={g} />} count={n} />
        ))}
      </FieldSet>

      <FieldSet legend="Popular in">
        <label htmlFor="f-country" className="sr-only">
          Country
        </label>
        <select id="f-country" name="country" defaultValue={f.country ?? ""} className={`${selectClass} w-full`}>
          <option value="">Any of 12 countries</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {COUNTRY_NAMES[c] ?? c.toUpperCase()}
            </option>
          ))}
        </select>
        <label htmlFor="f-device" className="sr-only">
          Device
        </label>
        <select id="f-device" name="device" defaultValue={f.device ?? ""} className={`${selectClass} w-full`}>
          <option value="">Any device</option>
          {DEVICES.map((d) => (
            <option key={d} value={d}>
              {DEVICE_LABELS[d] ?? d}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">In Roblox&apos;s discovery lists for that country or device in the last 7 days.</p>
      </FieldSet>

      <ApplyButton />
    </AutoSubmitForm>
  );
}

const activeCount = (f: ScreenerFilters) =>
  (f.launched !== "any" ? 1 : 0) + (f.min ? 1 : 0) + f.genres.length + f.stages.length + (f.country ? 1 : 0) + (f.device ? 1 : 0);

function describe(f: ScreenerFilters): string {
  const parts = [f.launched === "any" ? "launched any time" : `launched in the ${LAUNCHED_LABELS[f.launched].toLowerCase()}`];
  if (f.min) parts.push(`${fmtInt(f.min)}+ players`);
  if (f.country) parts.push(`popular in ${COUNTRY_NAMES[f.country] ?? f.country}`);
  if (f.device) parts.push(`popular on ${(DEVICE_LABELS[f.device] ?? f.device).toLowerCase()}`);
  if (f.q) parts.push(`matching “${f.q}”`);
  return parts.join(", ");
}

async function Results({ f, result }: { f: ScreenerFilters; result: ScreenerResult }) {
  const { matches, asOfMs, day } = result;
  const shown = matches.slice(0, f.limit);
  const ids = shown.map((g) => g.universeId);
  const db = getSiteDb()!;
  const [icons, sparks] = await Promise.all([getGameIcons(ids), getSparklines(db, ids, day)]);
  const query = filtersToQuery(f, { limit: PAGE_SIZE });
  const since = Date.parse(day) - 29 * DAY_MS;

  return (
    <section aria-labelledby="results" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="results" className="font-heading text-2xl font-bold">
            {fmtInt(matches.length)} {matches.length === 1 ? "game matches" : "games match"}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Seen in the week to {fmtDay(Date.parse(day))}, {describe(f)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="f-sort" className="text-[13px] text-muted-foreground">
            Sort by
          </label>
          <select id="f-sort" name="sort" form={FORM_ID} defaultValue={f.sort} className={selectClass}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
          {matches.length > 0 ? (
            <a
              href={`/api/v1/explore${query ? `${query}&` : "?"}format=csv`}
              className="inline-flex h-10 items-center rounded-[10px] border border-input px-3 text-sm text-text-2 hover:text-foreground"
            >
              Download CSV
            </a>
          ) : null}
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-text-2">
          <p>No games match these filters.</p>
          <p className="mt-2 text-sm">
            Try a wider launch window or fewer filters, or{" "}
            <Link href="/explore" className="text-link underline">
              clear them all
            </Link>
            . We only know games that have appeared in Roblox&apos;s discovery lists.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[960px] border-collapse text-sm tabular-nums">
            <thead>
              <tr className="text-right text-xs text-muted-foreground">
                <th scope="col" className="w-10 px-4 py-3 text-left font-medium">#</th>
                <th scope="col" className="px-2 py-3 text-left font-medium">Game</th>
                <th scope="col" className="px-2 py-3 text-left font-medium">Stage</th>
                <th scope="col" className="px-2 py-3 font-medium">Age</th>
                <th scope="col" className="px-2 py-3 font-medium">7-day avg</th>
                <th scope="col" className="px-2 py-3 font-medium">Week on week</th>
                <th scope="col" className="px-2 py-3 font-medium">Est. session</th>
                <th scope="col" className="px-2 py-3 font-medium">Favs per 1k visits</th>
                <th scope="col" className="px-4 py-3 font-medium">Since {fmtDay(since)}</th>
              </tr>
            </thead>
            <tbody className="whitespace-nowrap text-right">
              {shown.map((g, i) => {
                const name = displayName(g.name);
                const age = ageDays(g.createdMs, asOfMs);
                return (
                  <tr key={g.universeId} className="border-t border-[#1b2028] hover:bg-surface-2">
                    <td className="px-4 py-2.5 text-left text-muted-foreground">{i + 1}</td>
                    <th scope="row" className="px-2 py-2.5 text-left font-medium">
                      <Link href={`/games/${g.universeId}`} className="flex items-center gap-3 hover:text-link">
                        <GameIcon url={icons.get(g.universeId)} name={name} size={40} />
                        <span className="min-w-0">
                          <span className="block max-w-[260px] truncate">{name}</span>
                          <span className="mt-0.5 flex items-center gap-2 text-xs font-normal text-muted-foreground">
                            <GenreChip genre={g.genre} />
                            <span className="max-w-[140px] truncate">{g.creatorName}</span>
                          </span>
                        </span>
                      </Link>
                    </th>
                    <td className="px-2 py-2.5 text-left">
                      <StageBadge stage={g.stage} />
                    </td>
                    <td className="px-2 py-2.5 text-text-2">{age === null ? "—" : age >= 365 ? `${Math.floor(age / 365)} yr` : `${age} d`}</td>
                    <td className="px-2 py-2.5">{fmtInt(g.cur7)}</td>
                    <td className="px-2 py-2.5">{g.wowPct === null ? <span className="text-muted-foreground">new</span> : fmtPct(g.wowPct)}</td>
                    <td className="px-2 py-2.5">
                      {g.session === null ? <span className="text-muted-foreground">too new</span> : `${g.session.toFixed(1)} min`}
                    </td>
                    <td className="px-2 py-2.5">{g.favsPer1k === null ? <span className="text-muted-foreground">—</span> : g.favsPer1k.toFixed(1)}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex justify-end">
                        <Sparkline
                          values={sparks.get(g.universeId) ?? []}
                          tone={(g.wowPct ?? 0) < 0 ? "fall" : "rise"}
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
      )}

      {matches.length > shown.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground">
          <span>
            Showing {fmtInt(shown.length)} of {fmtInt(matches.length)}
            {f.limit >= 500 ? ". Download the CSV for the rest." : ""}
          </span>
          {f.limit < 500 ? (
            <Link
              href={`/explore${filtersToQuery(f, { limit: f.limit + PAGE_SIZE })}`}
              scroll={false}
              className="rounded-[10px] border border-input px-4 py-2 text-sm text-text-2 hover:text-foreground"
            >
              Show {fmtInt(Math.min(PAGE_SIZE, matches.length - shown.length))} more
            </Link>
          ) : null}
        </div>
      ) : null}

      <aside className="mt-4 rounded-2xl border border-border bg-card p-5 text-sm text-text-2">
        <h3 className="font-heading text-base font-bold text-foreground">Note on calculation</h3>
        <p className="mt-2">
          Stage comes from each game&apos;s trend: Breakout is launched in the last 30 days with 10,000+ players; Rising is up 25% or more
          on last week; Peaking is within 10% of its best week; Cooling is down on last week but above half its peak; Fading is at half its
          peak or less.{" "}
          <Link href="/methodology" className="text-link underline">
            How we measure
          </Link>
        </p>
        <p className="mt-2">
          Est. session is players divided by new visits per minute, so it&apos;s an estimate, not measured play time. It needs two
          consecutive days of data. Launch dates are Roblox&apos;s creation dates.
        </p>
      </aside>
    </section>
  );
}


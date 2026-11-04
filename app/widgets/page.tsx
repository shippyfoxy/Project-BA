import type { Metadata } from "next";
import Link from "next/link";
import { getSiteDb } from "@/lib/db/site";
import { parseSearch, searchGames } from "@/lib/trends/search";
import { displayName } from "@/lib/trends/names";
import { SITE } from "@/lib/widgets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Widgets and feeds: Roblox Pulse",
  description: "Show a Roblox game's player counts on your own site, README or forum post, and follow breakouts and updates by RSS.",
};

// RIVALS, so the examples show a game with steady data.
const EXAMPLE_ID = 6035872082;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-border bg-background px-4 py-3 font-mono text-[13px] text-text-2">
      {children}
    </pre>
  );
}

export default async function WidgetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = (first((await searchParams).q) ?? "").trim().slice(0, 100);
  const db = getSiteDb();
  const query = parseSearch(q);
  const hit = db && query ? (await searchGames(db, query, 1).catch(() => []))[0] : undefined;
  const id = hit?.universeId ?? EXAMPLE_ID;
  const name = hit ? displayName(hit.name) : "RIVALS";
  const embed = `<iframe src="${SITE}/embed/games/${id}" width="360" height="250" style="border:0" title="${name} on Roblox Pulse" loading="lazy"></iframe>`;
  const badge = (metric?: string) => `${SITE}/badge/${id}.svg${metric ? `?metric=${metric}` : ""}`;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-16 pt-9 md:px-6">
      <section className="flex flex-col gap-3">
        <h1 className="font-heading text-[clamp(36px,6vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em]">Widgets and feeds</h1>
        <p className="max-w-[760px] text-base text-text-2">
          Show a game&apos;s players on your own site, a GitHub README or a DevForum post, and follow new breakouts and updates in any RSS
          reader. All free, no key needed, refreshed hourly.
        </p>
        <form action="/widgets" method="get" role="search" className="flex max-w-xl flex-wrap gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Your game: name, Roblox link or ID"
            aria-label="Game"
            className="h-10 min-w-0 flex-[1_1_260px] rounded-[10px] border border-input bg-background px-3 text-sm"
          />
          <button type="submit" className="btn h-10">
            Make widgets
          </button>
        </form>
        {q && !hit ? <p className="text-sm text-text-2">No tracked game matches that, so the examples show RIVALS.</p> : null}
      </section>

      <section aria-labelledby="card" className="flex flex-col gap-4">
        <h2 id="card" className="font-heading text-[28px] font-bold tracking-[-0.02em]">
          Card for your site
        </h2>
        <div className="flex flex-wrap items-start gap-6">
          <iframe src={`/embed/games/${id}`} width={360} height={250} style={{ border: 0 }} title={`${name} on Roblox Pulse`} />
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-2 text-sm text-text-2">
            <p>
              {name}&apos;s 7-day average, its latest reading and the last 30 days, linking back to its page here. Paste this where you want it:
            </p>
            <Code>{embed}</Code>
            <p className="text-[13px] text-muted-foreground">
              It follows the reader&apos;s light or dark setting; add <code className="font-mono">?theme=light</code> or{" "}
              <code className="font-mono">?theme=dark</code> to the address to fix one.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="badges" className="flex flex-col gap-4">
        <h2 id="badges" className="font-heading text-[28px] font-bold tracking-[-0.02em]">
          Badges for READMEs and forum posts
        </h2>
        <div className="flex flex-col gap-4">
          {[
            { metric: undefined, label: "7-day average players" },
            { metric: "now", label: "Latest reading" },
            { metric: "trend", label: "Change on last week" },
          ].map((b) => (
            <div key={b.label} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element -- an SVG badge, shown as people will embed it */}
                <img src={`/badge/${id}.svg${b.metric ? `?metric=${b.metric}` : ""}`} alt={`${name}: ${b.label}`} height={20} />
                <span className="text-text-2">{b.label}</span>
              </div>
              <Code>{`![${name} players](${badge(b.metric)})`}</Code>
            </div>
          ))}
          <p className="text-[13px] text-muted-foreground">
            Markdown, for GitHub and the DevForum. Change the left-hand text with <code className="font-mono">?label=</code>, up to 24
            characters.
          </p>
        </div>
      </section>

      <section aria-labelledby="feeds" className="flex flex-col gap-4">
        <h2 id="feeds" className="font-heading text-[28px] font-bold tracking-[-0.02em]">
          RSS feeds
        </h2>
        <ul className="flex flex-col gap-4">
          <li className="flex flex-col gap-1.5">
            <span className="font-semibold">Breakouts</span>
            <span className="text-sm text-text-2">New games passing 1,000, 10,000 and 100,000 players a day, the day after it happens.</span>
            <Code>{`${SITE}/feeds/breakouts.xml`}</Code>
          </li>
          <li className="flex flex-col gap-1.5">
            <span className="font-semibold">Announced updates</span>
            <span className="text-sm text-text-2">
              Games that announced an update in their title, and what their players did two days later.{" "}
              <Link href="/updates" className="text-link hover:underline">
                About updates
              </Link>
            </span>
            <Code>{`${SITE}/feeds/updates.xml`}</Code>
          </li>
        </ul>
        <p className="text-[13px] text-muted-foreground">
          Player counts are sampled from Roblox&apos;s public APIs and are estimates. For bulk data, use the{" "}
          <Link href="/api" className="text-link hover:underline">
            API
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

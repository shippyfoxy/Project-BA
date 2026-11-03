import type { Metadata } from "next";
import Link from "next/link";
import { isProSession, proConfigured } from "@/lib/pro";
import { ProStar } from "@/components/pro/Pro";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pro: Roblox Pulse",
  description: "Roblox Pulse Pro: estimated revenue for every Top Earning game, CSV exports, longer windows and the full API, for $5 a month.",
};

const CHECKOUT_URL = process.env.NEXT_PUBLIC_PRO_CHECKOUT_URL ?? "";

const MESSAGES: Record<string, { tone: "good" | "bad"; text: string }> = {
  active: { tone: "good", text: "Pro is active on this browser. Thank you for supporting Roblox Pulse." },
  "signed-out": { tone: "good", text: "Signed out of Pro on this browser." },
  malformed: { tone: "bad", text: "That doesn't look like a licence key. Copy it from your Lemon Squeezy receipt email." },
  invalid: { tone: "bad", text: "That licence key wasn't recognised." },
  inactive: { tone: "bad", text: "That licence key is no longer active, usually because the subscription ended." },
  "wrong-product": { tone: "bad", text: "That key belongs to a different product." },
  "not-configured": { tone: "bad", text: "Pro isn't open yet. Please try again soon." },
  unavailable: { tone: "bad", text: "We couldn't reach the payment provider. Please try again in a minute." },
};

const FEATURES = [
  ["Revenue tab", "Estimated monthly payouts for all ~460 games in Roblox's Top Earning list, with ranges, daily movers and revenue per player."],
  ["Dollar figures everywhere", "On Trends, Explore, game pages, Genres, stage pages, Compare and the group comparison."],
  ["CSV exports", "Every Explore match and every game's full history, daily, weekly or monthly."],
  ["30 and 90-day windows", "Longer averages alongside the 7-day figures in every export."],
  ["The full API", "Explore, game history and the all-games daily file, with your licence key as a bearer token."],
];

export default async function ProPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [{ status }, pro] = await Promise.all([searchParams, isProSession()]);
  const message = status ? MESSAGES[status] : undefined;
  const open = proConfigured() && CHECKOUT_URL.startsWith("https://");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pb-16 pt-11 md:px-6">
      <header className="flex flex-col gap-3">
        <span className="inline-flex items-center gap-2 self-start rounded-full border border-[rgba(229,177,58,0.4)] bg-[rgba(229,177,58,0.10)] px-3 py-1 text-sm font-semibold text-gold">
          <ProStar />
          Roblox Pulse Pro
        </span>
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">See what Roblox games earn</h1>
        <p className="text-[17px] text-text-2">
          Player counts, stages, genres and Top Earning ranks stay free. Pro adds the revenue estimates and the data to take away, for{" "}
          <strong className="text-foreground">$5 a month</strong>. Cancel any time.
        </p>
      </header>

      {message ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.tone === "good" ? "border-[rgba(74,139,232,0.4)] bg-[rgba(74,139,232,0.08)]" : "border-[rgba(217,115,44,0.4)] bg-[rgba(217,115,44,0.08)]"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <section aria-labelledby="included" className="flex flex-col gap-3">
        <h2 id="included" className="font-heading text-2xl font-bold">
          What&apos;s included
        </h2>
        <ul className="flex flex-col gap-2.5">
          {FEATURES.map(([title, text]) => (
            <li key={title} className="flex gap-3 rounded-2xl border border-border bg-card px-5 py-4">
              <ProStar className="mt-1 size-3.5" />
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="text-sm text-text-2">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-muted-foreground">
          Revenue figures are estimates modelled from Roblox&apos;s Top Earning rank, not Roblox data.{" "}
          <Link href="/methodology#revenue" className="text-link underline">
            How they are estimated
          </Link>
        </p>
      </section>

      {pro ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-heading text-xl font-bold">You have Pro on this browser</h2>
          <p className="text-sm text-text-2">
            For the API, send your licence key as <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px]">Authorization: Bearer &lt;key&gt;</code>.
            Manage or cancel the subscription from the link in your Lemon Squeezy receipt.
          </p>
          <form action="/api/pro/logout" method="post">
            <button type="submit" className="h-10 rounded-[10px] border border-input px-4 text-sm text-text-2 hover:text-foreground">
              Sign out of Pro here
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-2xl border border-[rgba(229,177,58,0.4)] bg-[rgba(229,177,58,0.07)] p-6">
            <h2 className="font-heading text-xl font-bold">Get Pro</h2>
            {open ? (
              <a href={CHECKOUT_URL} className="inline-flex h-11 items-center self-start rounded-xl bg-gold px-5 text-sm font-bold text-background hover:brightness-110">
                Subscribe for $5 a month
              </a>
            ) : (
              <p className="text-sm text-text-2">Pro opens soon.</p>
            )}
            <p className="text-[13px] text-muted-foreground">
              Payments are handled by Lemon Squeezy, which sends your licence key by email straight after checkout.
            </p>
          </section>

          <section aria-labelledby="key" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
            <h2 id="key" className="font-heading text-xl font-bold">
              Already subscribed?
            </h2>
            <form action="/api/pro/activate" method="post" className="flex flex-wrap gap-2">
              <label htmlFor="pro-key" className="sr-only">
                Licence key
              </label>
              <input
                id="pro-key"
                name="key"
                required
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste your licence key"
                className="h-11 min-w-0 flex-[1_1_320px] rounded-xl border border-input bg-background px-4 font-mono text-sm outline-none focus:border-ring"
              />
              <button type="submit" className="h-11 rounded-xl bg-rise px-5 text-sm font-bold text-background hover:brightness-110">
                Unlock Pro
              </button>
            </form>
            <p className="text-[13px] text-muted-foreground">Kept in a secure cookie on this browser for 30 days.</p>
          </section>
        </>
      )}
    </main>
  );
}

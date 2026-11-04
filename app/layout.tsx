import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { MainNav } from "@/components/v2/MainNav";
import { ProProvider } from "@/components/pro/Pro";
import { ThemeToggle } from "@/components/v2/ThemeToggle";
import { THEME_SCRIPT } from "@/lib/theme";
import { getCachedActiveGames } from "@/lib/trends/cached";
import { fmtDay } from "@/lib/format";
import { UtcTime } from "@/components/v2/UtcTime";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Roblox Pulse: what's moving on Roblox",
  description:
    "Player history for every game in Roblox's discovery lists since May 2026. Spot breakouts, see what's fading, and pull the data yourself.",
  alternates: {
    types: {
      "application/rss+xml": [
        { url: "/feeds/breakouts.xml", title: "Roblox Pulse: breakouts" },
        { url: "/feeds/updates.xml", title: "Roblox Pulse: announced updates" },
      ],
    },
  },
};

// Pages that are otherwise static still pick up the latest refresh time hourly.
export const revalidate = 3600;

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="7" fill="var(--rise)" transform="rotate(-6 14 14)" />
      <polyline
        points="5,15 9,15 11.5,8 15,20 17.5,12 23,12"
        fill="none"
        stroke="var(--background)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The same cached data as the Trends and stage pages, so the header never
  // disagrees with the "last refresh" they show.
  // A slow database must not hold up every page, so the header gives it 4 seconds.
  const active = await Promise.race([getCachedActiveGames().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 4_000))]);
  const refreshedMs = active?.asOfMs ?? null;
  return (
    // The theme class is set by THEME_SCRIPT before React hydrates, so it may differ from the server's.
    <html lang="en-GB" className={`dark ${geistSans.variable} ${geistMono.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ProProvider>
        <header className="border-b border-border">
          {/* Phones: logo and toggle, then the tabs as one swipeable row.
              Wide screens: everything on one line. */}
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 lg:flex-nowrap lg:py-3 md:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-2.5 font-heading text-[19px] font-extrabold tracking-tight">
              <Logo />
              Roblox Pulse
            </Link>
            <span className="ml-auto flex shrink-0 items-center gap-3 lg:order-3">
              {refreshedMs ? (
                <span className="flex items-center gap-2 whitespace-nowrap font-mono text-xs text-muted-foreground lg:hidden xl:flex">
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                    <circle cx="4" cy="4" r="4" fill="#3FA34D" />
                  </svg>
                  <span className="hidden sm:inline lg:hidden 2xl:inline">Data to {fmtDay(refreshedMs)},</span> <UtcTime ms={refreshedMs} compact />
                </span>
              ) : null}
              <ThemeToggle />
            </span>
            <MainNav />
          </div>
        </header>
        {children}
        <footer className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-3 px-4 py-5 text-[13px] text-muted-foreground md:px-6">
            <span>
              Player counts are sampled from Roblox&apos;s public APIs. All figures are estimates, not Roblox
              telemetry. Images from Roblox. Not affiliated with Roblox.
            </span>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/methodology" className="hover:text-foreground">
                How we measure
              </Link>
              <Link href="/widgets" className="hover:text-foreground">
                Widgets and RSS
              </Link>
            </span>
          </div>
        </footer>
        </ProProvider>
        <Analytics />
      </body>
    </html>
  );
}

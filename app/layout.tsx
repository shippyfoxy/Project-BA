import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { MainNav } from "@/components/v2/MainNav";
import { getCachedActiveGames } from "@/lib/trends/cached";
import { fmtDay, fmtTimeUtc } from "@/lib/format";
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
  const refreshedMs = (await getCachedActiveGames().catch(() => null))?.asOfMs ?? null;
  return (
    <html lang="en-GB" className={`dark ${geistSans.variable} ${geistMono.variable} ${bricolage.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="border-b border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
            <Link href="/" className="flex items-center gap-2.5 font-heading text-[19px] font-extrabold tracking-tight">
              <Logo />
              Roblox Pulse
            </Link>
            <MainNav />
            {refreshedMs ? (
              <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                  <circle cx="4" cy="4" r="4" fill="#3FA34D" />
                </svg>
                Data to {fmtDay(refreshedMs)}, {fmtTimeUtc(refreshedMs)}
              </span>
            ) : null}
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
              <Link href="/dashboard" className="hover:text-foreground">
                Classic dashboard
              </Link>
              <Link href="/ab-testing" className="hover:text-foreground">
                Group comparison
              </Link>
              <Link href="/results" className="hover:text-foreground">
                Summary
              </Link>
              <Link href="/methodology" className="hover:text-foreground">
                How we measure
              </Link>
            </span>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}

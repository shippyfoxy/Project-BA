import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
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

const NAV = [
  { href: "/", label: "Trends" },
  { href: "/explore", label: "Explore" },
  { href: "/dashboard", label: "Classic dashboard" },
  { href: "/ab-testing", label: "A/B compare" },
  { href: "/methodology", label: "Methodology" },
];

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" className={`dark ${geistSans.variable} ${geistMono.variable} ${bricolage.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="border-b border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
            <Link href="/" className="flex items-center gap-2.5 font-heading text-[19px] font-extrabold tracking-tight">
              <Logo />
              Roblox Pulse
            </Link>
            <nav aria-label="Main" className="flex flex-wrap gap-1 text-sm font-medium">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-lg px-3 py-2 text-text-2 hover:bg-secondary hover:text-foreground"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        {children}
        <footer className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-3 px-4 py-5 text-[13px] text-muted-foreground md:px-6">
            <span>
              Player counts are sampled from Roblox&apos;s public APIs. All figures are estimates, not Roblox
              telemetry. Images from Roblox. Not affiliated with Roblox.
            </span>
            <span className="flex gap-4">
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

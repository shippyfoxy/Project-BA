import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Roblox Pulse — analytics proxies for Roblox discovery",
  description:
    "A portfolio analytics dashboard exploring genre retention and session-length cohorts using Roblox's public, keyless APIs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <header className="border-b border-border/60">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden />
              <span className="font-semibold tracking-tight">Roblox Pulse</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                — proxy analytics for Roblox discovery
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground">Dashboard</Link>
              <Link href="/methodology" className="hover:text-foreground">Methodology</Link>
              <Link href="/results" className="hover:text-foreground">Results</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="border-t border-border/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted-foreground md:px-6">
            Built with public Roblox endpoints. All metrics are estimated proxies, not in-game telemetry.
          </div>
        </footer>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { loadSnapshot } from "@/lib/snapshot/loader";
import { ABTestPanel } from "@/components/dashboard/ABTestPanel";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "A/B Compare — Roblox Pulse",
  description:
    "Compare two groups of Roblox games across key performance metrics by filtering by genre, age rating, and device platform.",
};

export default async function ABTestingPage() {
  const snapshot = await loadSnapshot();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Group comparison</h1>
        <p className="text-sm text-muted-foreground">
          Define two groups by genre, age rating, and device platform, then compare their
          estimated performance metrics side by side. All figures are proxy estimates derived
          from public Roblox data — not in-game telemetry.
        </p>
      </header>
      <ABTestPanel games={snapshot.games} />
    </main>
  );
}

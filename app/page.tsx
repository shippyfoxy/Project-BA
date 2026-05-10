import { loadSnapshot } from "@/lib/snapshot/loader";
import {
  regionBreakdown,
  retentionByGenreAndAge,
  sessionCohorts,
  summarise,
  topGamesUnified,
  topGenresByRetention,
} from "@/lib/snapshot/aggregate";
import { KpiStrip } from "@/components/dashboard/KpiStrip";
import { GenreRetentionChart } from "@/components/dashboard/GenreRetentionChart";
import { SessionCohortChart } from "@/components/dashboard/SessionCohortChart";
import { TopGamesPanel } from "@/components/dashboard/TopGamesPanel";
import { GenreAgeRecommendationTable } from "@/components/dashboard/GenreAgeRecommendationTable";
import { RegionBreakdownTable } from "@/components/dashboard/RegionBreakdownTable";

export const revalidate = 3600;

export default async function HomePage() {
  const snapshot = await loadSnapshot();
  const kpi = summarise(snapshot);
  const genres = topGenresByRetention(snapshot, 8);
  const cohorts = sessionCohorts(snapshot);
  const unified = topGamesUnified(snapshot, 25);
  const genreAge = retentionByGenreAndAge(snapshot, 10);
  const regions = regionBreakdown(snapshot);
  const hasCohortData = cohorts.some((c) => c.count > 0);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
      <KpiStrip kpi={kpi} />
      <TopGamesPanel rows={unified} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GenreRetentionChart rows={genres} />
        <SessionCohortChart rows={cohorts} hasCohortData={hasCohortData} />
      </div>
      <GenreAgeRecommendationTable rows={genreAge} />
      <RegionBreakdownTable rows={regions} />
    </main>
  );
}

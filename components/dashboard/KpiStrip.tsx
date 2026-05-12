import { Card, CardContent } from "@/components/ui/card";
import type { KpiSummary } from "@/lib/snapshot/aggregate";

const fmt = new Intl.NumberFormat("en-GB");
const fmtCompact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });

interface Props {
  kpi: KpiSummary;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="bg-card/60 backdrop-blur">
      <CardContent className="px-5 py-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function nextRefreshUTC(generatedAt: string): string {
  const thirtyMin = 30 * 60 * 1000;
  const next = new Date(
    Math.ceil((new Date(generatedAt).getTime() + 1) / thirtyMin) * thirtyMin,
  );
  return next.toISOString().slice(11, 16) + " UTC";
}

export function KpiStrip({ kpi }: Props) {
  const generated = new Date(kpi.generatedAt);
  const utcTime =
    generated.toISOString().slice(0, 10) +
    " " +
    generated.toISOString().slice(11, 16) +
    " UTC";
  const nextRefresh = nextRefreshUTC(kpi.generatedAt);
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi
        label="Games sampled"
        value={fmt.format(kpi.totalGames)}
        hint="from explore-api seeds"
      />
      <Kpi
        label="Concurrent players"
        value={fmtCompact.format(kpi.totalPlaying)}
        hint="across the sample"
      />
      <Kpi
        label="Top genre (proxy)"
        value={kpi.topGenre}
        hint="highest mean retention proxy"
      />
      <Kpi
        label="Snapshot taken"
        value={utcTime}
        hint={`next refresh ~${nextRefresh} · cohort coverage ${Math.round(kpi.cohortCoverage * 100)}%`}
      />
    </section>
  );
}

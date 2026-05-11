import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { GenreAgeRow } from "@/lib/snapshot/aggregate";

const fmt = new Intl.NumberFormat("en-GB");
const pct = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 1,
});

function fmtHour(h: number | null): string {
  if (h === null) return "—";
  return `${String(h).padStart(2, "0")}:00 UTC`;
}

interface Props {
  rows: GenreAgeRow[];
}

export function GenreAgeRecommendationTable({ rows }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Where retention is strongest</CardTitle>
        <CardDescription>
          Genre × age-rating combinations ranked by an{" "}
          <strong>adjusted</strong> retention score that pulls small-sample
          combos toward the catalogue mean &mdash; so a 7-game combo can&rsquo;t
          beat a 200-game combo on the strength of two outliers. Combos with
          fewer than ten games are filtered out entirely. The{" "}
          <em>Player share</em> column surfaces how mainstream vs niche each
          combo&rsquo;s audience actually is. <em>Peak hour</em> is the UTC
          hour with the highest combined concurrent players across all snapshots
          for that combo.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No combos with enough games yet — each genre × age pairing needs at
            least 10 games. More data becomes available after the next snapshot
            refresh.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-right">#</TableHead>
                  <TableHead>Genre</TableHead>
                  <TableHead>Age rating</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead className="text-right">Player share</TableHead>
                  <TableHead className="text-right">Avg session (min)</TableHead>
                  <TableHead className="text-right">Peak hour</TableHead>
                  <TableHead className="text-right">Adjusted retention</TableHead>
                  <TableHead className="text-right">Raw mean</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.genre}|${r.ageRecommendation}`}>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {r.genre}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {r.ageRecommendation}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.format(r.gameCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {pct.format(r.shareOfPlayers)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.meanSessionMinutes === null
                        ? "—"
                        : r.meanSessionMinutes.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtHour(r.peakHourUTC)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-foreground">
                      {r.adjustedRetentionProxy.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.meanRetentionProxy.toFixed(3)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

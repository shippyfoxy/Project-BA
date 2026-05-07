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
import type { TopGameRow } from "@/lib/snapshot/aggregate";

const fmt = new Intl.NumberFormat("en-GB");

interface Props {
  rows: TopGameRow[];
}

export function TopGamesTable({ rows }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top games by retention proxy</CardTitle>
        <CardDescription>
          Highest scoring games on the proxy — a useful smell test for the
          metric, not a leaderboard. Click through to verify.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-right">#</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Genre</TableHead>
                <TableHead className="text-right">Concurrent</TableHead>
                <TableHead className="text-right">Proxy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.universeId}>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {i + 1}
                  </TableCell>
                  <TableCell>
                    <a
                      className="font-medium text-foreground hover:underline"
                      href={`https://www.roblox.com${r.canonicalUrlPath}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.name}
                    </a>
                    <div className="text-xs text-muted-foreground">{r.creatorName}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {r.genreL1}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.format(r.playing)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.retentionProxy.toFixed(3)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

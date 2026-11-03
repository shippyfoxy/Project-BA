import { estMonthlyDevEx } from "./revenue";

export const RESOLUTIONS = ["daily", "weekly", "monthly"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

const DAY_MS = 86_400_000;

// One day of a game's history as stored in game_daily, plus its Top Earning rank.
export interface DayRow {
  day: string;
  playing_avg: number;
  playing_min: number;
  playing_max: number;
  playing_max_at: string;
  visits: number;
  favorites: number | null;
  up_votes: number | null;
  down_votes: number | null;
  samples: number;
  top_earning_rank: number | null;
  in_range?: boolean; // false for the extra day fetched only to measure new visits
}

export interface DailyOut extends Omit<DayRow, "in_range"> {
  new_visits: number | null; // null when the day before has no reading
  est_monthly_devex_usd: number | null; // MODELLED from the day's rank
}

export interface PeriodOut {
  period_start: string;
  period_end: string;
  days: number; // days with readings
  playing_avg: number; // mean of the daily averages
  playing_min: number;
  playing_max: number;
  playing_max_at: string;
  visits: number; // lifetime, at the period's last reading
  new_visits: number | null; // summed over days whose previous day has a reading
  favorites: number | null;
  up_votes: number | null;
  down_votes: number | null;
  samples: number;
  ranked_days: number; // days in Roblox's Top Earning list
  best_top_earning_rank: number | null;
  est_monthly_devex_usd: number | null; // MODELLED: mean over ranked days
}

const thousands = (v: number | undefined) => (v === undefined ? null : Math.round(v / 1_000) * 1_000);

export function toDaily(rows: DayRow[]): DailyOut[] {
  return rows.flatMap(({ in_range, ...r }, i) => {
    if (in_range === false) return [];
    const prev = rows[i - 1];
    const consecutive = prev && Date.parse(r.day) - Date.parse(prev.day) === DAY_MS;
    return {
      ...r,
      new_visits: consecutive ? Math.max(r.visits - prev.visits, 0) : null,
      est_monthly_devex_usd: thousands(estMonthlyDevEx(r.top_earning_rank)?.mid),
    };
  });
}

// Weeks run Monday to Sunday (UTC); months are calendar months.
export function periodStart(day: string, res: Exclude<Resolution, "daily">): string {
  if (res === "monthly") return `${day.slice(0, 7)}-01`;
  const ms = Date.parse(day);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(ms - dow * DAY_MS).toISOString().slice(0, 10);
}

export function rollUp(rows: DayRow[], res: Exclude<Resolution, "daily">): PeriodOut[] {
  const daily = toDaily(rows);
  const groups = new Map<string, DailyOut[]>();
  for (const d of daily) {
    const key = periodStart(d.day, res);
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups].map(([start, ds]) => {
    const last = ds[ds.length - 1];
    const high = ds.reduce((a, b) => (b.playing_max > a.playing_max ? b : a));
    const lastWith = <K extends "favorites" | "up_votes" | "down_votes">(k: K) => [...ds].reverse().find((d) => d[k] !== null)?.[k] ?? null;
    const newVisits = ds.filter((d) => d.new_visits !== null);
    const ranked = ds.filter((d) => d.top_earning_rank !== null);
    const est = ranked.map((d) => estMonthlyDevEx(d.top_earning_rank)!.mid);
    return {
      period_start: start,
      period_end: last.day,
      days: ds.length,
      playing_avg: Math.round(ds.reduce((a, d) => a + d.playing_avg, 0) / ds.length),
      playing_min: Math.min(...ds.map((d) => d.playing_min)),
      playing_max: high.playing_max,
      playing_max_at: high.playing_max_at,
      visits: last.visits,
      new_visits: newVisits.length ? newVisits.reduce((a, d) => a + d.new_visits!, 0) : null,
      favorites: lastWith("favorites"),
      up_votes: lastWith("up_votes"),
      down_votes: lastWith("down_votes"),
      samples: ds.reduce((a, d) => a + d.samples, 0),
      ranked_days: ranked.length,
      best_top_earning_rank: ranked.length ? Math.min(...ranked.map((d) => d.top_earning_rank!)) : null,
      est_monthly_devex_usd: est.length ? thousands(est.reduce((a, b) => a + b, 0) / est.length) : null,
    };
  });
}

// One CSV cell. Text a spreadsheet would run as a formula (game names are
// chosen by anyone on Roblox) gets a leading apostrophe; numbers, including
// negative ones, stay numbers.
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends object>(rows: T[], cols: (keyof T)[]): string {
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
}

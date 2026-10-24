const int = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 2 });

export const fmtInt = (n: number) => int.format(Math.round(n));
export const fmtCompact = (n: number) => compact.format(n);

export function fmtPct(n: number): string {
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${int.format(Math.abs(r))}%`;
}

const dateUtc = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const weekdayDateUtc = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const timeUtc = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

export const fmtDay = (ms: number) => dateUtc.format(ms);
export const fmtWeekdayDay = (ms: number) => weekdayDateUtc.format(ms);
export const fmtTimeUtc = (ms: number) => `${timeUtc.format(ms)} UTC`;

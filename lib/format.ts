const int = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export const fmtInt = (n: number) => int.format(Math.round(n));

// Deterministic compact numbers (1.96M, 2.6k, 31.7B). Intl compact notation
// differs between Node and browsers ("1M" vs "1m", "31.7B" vs "31.7bn"), which
// breaks React hydration, so it is not used.
const UNITS: [number, string][] = [
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "k"],
];

export function fmtCompact(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const round = (x: number) => Number(x.toFixed(digits));
  for (let i = 0; i < UNITS.length; i++) {
    const [v, suffix] = UNITS[i];
    if (a < v) continue;
    const r = round(a / v);
    if (r >= 1000 && i > 0) return `${sign}${round(a / UNITS[i - 1][0])}${UNITS[i - 1][1]}`;
    return `${sign}${r}${suffix}`;
  }
  const r = Math.round(a);
  return r >= 1000 ? `${sign}1k` : `${sign}${r}`;
}

export function fmtPct(n: number): string {
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${int.format(Math.abs(r))}%`;
}

// Dates are formatted by hand for the same reason: ICU builds disagree on
// abbreviations such as "Sep" and "Sept".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

export const fmtDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
export const fmtWeekdayDay = (ms: number) => `${WEEKDAYS[new Date(ms).getUTCDay()]} ${fmtDay(ms)}`;
export const fmtLongDay = (ms: number) => `${fmtWeekdayDay(ms)} ${new Date(ms).getUTCFullYear()}`;
export const fmtTimeUtc = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};

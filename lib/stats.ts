// Percentiles across games, matching Postgres percentile_cont (linear interpolation).
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Share of values strictly below v, from 0 to 1.
export function shareBelow(sorted: number[], v: number): number {
  if (sorted.length === 0) return NaN;
  let n = 0;
  while (n < sorted.length && sorted[n] < v) n++;
  return n / sorted.length;
}

// A round axis maximum at or above v with at most five gridline steps,
// using steps of 1, 2, 2.5 or 5 times a power of ten.
export function niceMax(v: number): { max: number; step: number } {
  if (!(v > 0)) return { max: 1, step: 0.25 };
  const exp = Math.floor(Math.log10(v));
  const steps = [1, 2, 2.5, 5].flatMap((m) => [m * 10 ** (exp - 1), m * 10 ** exp]).sort((a, b) => a - b);
  for (const step of steps) {
    const max = Math.ceil(v / step) * step;
    if (max / step <= 5) return { max, step };
  }
  return { max: 10 ** (exp + 1), step: 2 * 10 ** exp };
}

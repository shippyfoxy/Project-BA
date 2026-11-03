// Estimated creator payouts from a game's position in Roblox's Top Earning
// list. MODELLED, not measured: Roblox publishes the order (7-day Robux spend)
// but no amounts. The curve is a power law fitted to the RDC 2026 creator
// payout tiers for the year to 30 June 2026 (top 10 averaged $65.7M, top 100
// $10.8M, top 1,000 $1.4M, $1.7B in all) and the $0.0038 DevEx rate:
//   monthly DevEx (USD) = 13.26M x rank^-1.041
// It is per game while RDC's tiers are per creator, who may own several
// games, so it reads conservative at the very top. The range is the fit's
// rough 10th to 90th percentile.
export const REVENUE_MODEL = {
  scale: 13_260_000,
  exponent: 1.041,
  low: 0.7,
  high: 1.5,
  devexPerRobux: 0.0038,
  creatorShare: 0.7,
} as const;

export interface RevenueEstimate {
  mid: number;
  low: number;
  high: number;
}

export function estMonthlyDevEx(rank: number | null | undefined): RevenueEstimate | null {
  if (!rank || rank < 1) return null;
  const mid = REVENUE_MODEL.scale * rank ** -REVENUE_MODEL.exponent;
  return { mid, low: mid * REVENUE_MODEL.low, high: mid * REVENUE_MODEL.high };
}

// Players' monthly Robux spend implied by a payout: DevEx pays per Robux the
// creator earns, and creators keep about 70% of what players spend.
export const robuxSpentFor = (devexUsd: number) => devexUsd / REVENUE_MODEL.devexPerRobux / REVENUE_MODEL.creatorShare;

// Two significant figures: the model is not precise enough for more.
export function fmtUsdEstimate(v: number): string {
  if (v >= 1e6) return `$${(v / 1e6).toPrecision(2).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `$${Math.round(Number((v / 1e3).toPrecision(2)))}k`;
  return `$${Number(v.toPrecision(2))}`;
}

// Estimated creator payouts from a game's position in Roblox's Top Earning
// list. MODELLED, not measured: Roblox publishes the order (7-day Robux spend)
// but no amounts. The curve is a power law fitted to the RDC 2026 creator
// payout tiers for the year to 30 June 2026 (top 10 averaged $65.7M, top 100
// $10.8M, top 1,000 $1.4M, $1.7B in all) and the $0.0038 DevEx rate:
//   monthly DevEx (USD) = 13.26M x rank^-1.041
// It is per game while RDC's tiers are per creator, who may own several
// games, so it reads conservative at the very top.
//
// The curve is steep at the top (#1 is twice #2), but Roblox gives only the
// order, and neighbours often earn about the same: two games swapping places
// would halve one estimate and double the other overnight. So an estimate
// comes from a game's effective rank over the last 7 lists (EARNING_WEEK),
// and its range runs from the rank below to the rank above, widened by the
// fit's rough 10th to 90th percentile, so neighbours' ranges overlap.
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

const atRank = (rank: number) => REVENUE_MODEL.scale * rank ** -REVENUE_MODEL.exponent;

// Takes a whole rank or an effective one.
export function estMonthlyDevEx(rank: number | null | undefined): RevenueEstimate | null {
  if (!rank || rank < 1) return null;
  return {
    mid: atRank(rank),
    low: atRank(rank + 1) * REVENUE_MODEL.low,
    high: atRank(Math.max(rank - 1, 1)) * REVENUE_MODEL.high,
  };
}

// Each game's effective rank over the last 7 recorded Top Earning lists: the
// rank whose estimate is the mean of its daily estimates. A day it was not
// listed counts as the rank just below that day's list. Use as a CTE:
// `with ${EARNING_WEEK} ... join earning_week using (universe_id)`.
export const EARNING_WEEK = `
  earning_days as (
    select day, max(rank) + 1 as below from earning_ranks group by day order by day desc limit 7),
  earning_week as (
    select w.universe_id,
           power(avg(power(coalesce(e.rank, d.below)::float8, -${REVENUE_MODEL.exponent})), -1 / ${REVENUE_MODEL.exponent}::float8) as eff_rank
    from (select distinct universe_id from earning_ranks join earning_days using (day)) w
    cross join earning_days d
    left join earning_ranks e on e.universe_id = w.universe_id and e.day = d.day
    group by w.universe_id)`;

// Players' monthly Robux spend implied by a payout: DevEx pays per Robux the
// creator earns, and creators keep about 70% of what players spend.
export const robuxSpentFor = (devexUsd: number) => devexUsd / REVENUE_MODEL.devexPerRobux / REVENUE_MODEL.creatorShare;

// Two significant figures: the model is not precise enough for more.
export function fmtUsdEstimate(v: number): string {
  // Round first so a value just under a boundary (996k) reads $1M, not $1000k.
  const r = Number(v.toPrecision(2));
  if (r >= 1e6) return `$${Number((r / 1e6).toPrecision(2))}M`;
  if (r >= 1e3) return `$${Number((r / 1e3).toPrecision(2))}k`;
  return `$${r}`;
}

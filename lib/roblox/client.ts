// Typed, rate-limited, retrying client for the public Roblox endpoints
// used by Roblox Pulse. Keyless. See lib/roblox/types.ts for shapes.

import {
  ExploreSortsResponse,
  GamesBatchResponse,
  GameRecord,
  ServersResponse,
  VotesBatchResponse,
  VoteRecord,
} from "./types";

const UA = "roblox-pulse/0.1 (+https://github.com/shippyfoxy/roblox-pulse)";

// Brief: official APIs ceiling 5 req/sec. We pace at 2 req/sec — the per-IP
// limit appears to be a sliding window across all roblox.com hosts, and bursts
// of ~40 calls at 3 req/sec trip a multi-minute lockout (observed during the
// expanded-seed refresh). 500ms interval matches what manual probes tolerated.
const MIN_INTERVAL_MS = 500;

// Roblox /v1/games and /v1/games/votes both cap at 50 universeIds per call.
export const UNIVERSE_BATCH_SIZE = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Serialises concurrent callers via a promise chain — naive read-then-set on a
// shared `last` lets parallel awaits sleep the same interval and fire together,
// which trips Roblox's 429s when many batches race (e.g. games+votes in parallel).
class TokenBucket {
  private last = 0;
  private chain: Promise<void> = Promise.resolve();
  take(): Promise<void> {
    const next = this.chain.then(async () => {
      const wait = Math.max(0, this.last + MIN_INTERVAL_MS - Date.now());
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
    });
    this.chain = next.catch(() => {});
    return next;
  }
}

const bucket = new TokenBucket();

interface FetchOpts {
  retries?: number;
  signal?: AbortSignal;
}

// Roblox accepts these axes on /explore-api/v1/get-sorts. Each (country, device)
// pair returns a different ranked slice; fanning out widens the seed pool.
export interface SeedVariant {
  country?: string; // ISO-2 lowercase, e.g. "us", "gb". Default "us".
  device?: string;  // "computer" | "high_end_phone" | "low_end_phone" | "high_end_tablet" | "console". Default "computer".
}

interface ExploreOpts extends FetchOpts, SeedVariant {}

export class RobloxApiError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    message: string,
  ) {
    super(`Roblox API ${status} on ${url}: ${message}`);
  }
}

async function jget<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  // 429s persist longer than transient 5xx — give them a bigger retry envelope.
  const rateLimitRetries = Math.max(retries, 5);

  for (let attempt = 0; attempt <= Math.max(retries, rateLimitRetries); attempt++) {
    await bucket.take();

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: opts.signal,
        // We do our own caching — disable Next's default fetch cache here.
        cache: "no-store",
      });
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(backoff(attempt));
      continue;
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "0", 10);
      // Honour Retry-After when present, else 10s/20s/40s/80s/160s. Roblox's
      // per-IP lockout typically lifts within a minute or two.
      const wait = retryAfter > 0 ? retryAfter * 1000 : 10_000 * Math.pow(2, attempt);
      if (attempt >= rateLimitRetries) {
        throw new RobloxApiError(url, 429, "rate limited (out of retries)");
      }
      await sleep(wait);
      continue;
    }

    if (res.status >= 500) {
      if (attempt === retries) {
        throw new RobloxApiError(url, res.status, await res.text());
      }
      await sleep(backoff(attempt));
      continue;
    }

    if (!res.ok) {
      throw new RobloxApiError(url, res.status, await res.text());
    }

    return (await res.json()) as T;
  }

  throw new RobloxApiError(url, 0, "exhausted retries");
}

function backoff(attempt: number): number {
  const base = 500 * Math.pow(2, attempt);
  const jitter = Math.random() * 250;
  return base + jitter;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// --- Public surface --------------------------------------------------------

// Discovery seed. Each sort embeds 30-90 games with universeId/playerCount/votes.
// Pass a stable sessionId to make Roblox happy; new uuid each refresh is fine.
// Optional `country`/`device` change the regional slice — use `getExpandedSeed`
// to fan across many variants for a wider seed pool.
export async function getExploreSorts(
  sessionId: string,
  opts?: ExploreOpts,
): Promise<ExploreSortsResponse> {
  const params = new URLSearchParams({ sessionId });
  if (opts?.country) params.set("country", opts.country);
  if (opts?.device) params.set("device", opts.device);
  const url = `https://apis.roblox.com/explore-api/v1/get-sorts?${params.toString()}`;
  return jget<ExploreSortsResponse>(url, opts);
}

// Fans get-sorts across the supplied (country, device) variants and returns the
// deduped union of universeIds plus per-variant new-id counts (for logging).
// Calls run sequentially through the shared TokenBucket — N variants ≈ N*200ms.
export async function getExpandedSeed(
  sessionId: string,
  variants: SeedVariant[],
  opts?: FetchOpts,
): Promise<{
  universeIds: number[];
  perVariant: Array<{ variant: SeedVariant; total: number; added: number }>;
}> {
  const seen = new Set<number>();
  const perVariant: Array<{ variant: SeedVariant; total: number; added: number }> = [];

  for (const variant of variants) {
    const sorts = await getExploreSorts(sessionId, { ...opts, ...variant });
    const ids = (sorts.sorts ?? [])
      .filter((s) => s.contentType === "Games")
      .flatMap((s) => (s.games ?? []).map((g) => g.universeId))
      .filter((n) => Number.isInteger(n) && n > 0);

    let added = 0;
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        added++;
      }
    }
    perVariant.push({ variant, total: ids.length, added });
  }

  return { universeIds: [...seen], perVariant };
}

// Resolves placeId -> universeId. Used when seeds only have placeIds.
export async function resolveUniverseId(
  placeId: number,
  opts?: FetchOpts,
): Promise<number | null> {
  const url = `https://apis.roblox.com/universes/v1/places/${placeId}/universe`;
  const res = await jget<{ universeId: number | null }>(url, opts);
  return res.universeId ?? null;
}

// Batched. Private/deleted universes drop out silently — output may be < input.
export async function getGames(
  universeIds: number[],
  opts?: FetchOpts,
): Promise<GameRecord[]> {
  const out: GameRecord[] = [];
  for (const ids of chunk(universeIds, UNIVERSE_BATCH_SIZE)) {
    const url = `https://games.roblox.com/v1/games?universeIds=${ids.join(",")}`;
    const res = await jget<GamesBatchResponse>(url, opts);
    out.push(...(res.data ?? []));
  }
  return out;
}

// Batched. Output may be < input for the same reason as getGames.
export async function getVotes(
  universeIds: number[],
  opts?: FetchOpts,
): Promise<VoteRecord[]> {
  const out: VoteRecord[] = [];
  for (const ids of chunk(universeIds, UNIVERSE_BATCH_SIZE)) {
    const url = `https://games.roblox.com/v1/games/votes?universeIds=${ids.join(",")}`;
    const res = await jget<VotesBatchResponse>(url, opts);
    out.push(...(res.data ?? []));
  }
  return out;
}

// Servers endpoint takes placeId, not universeId. Used for live server count.
export async function getPublicServers(
  placeId: number,
  opts?: FetchOpts,
): Promise<ServersResponse> {
  const url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&limit=100`;
  return jget<ServersResponse>(url, opts);
}

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

const UA = "roblox-pulse/0.1 (+https://github.com/yourname/roblox-pulse)";

// Brief: official APIs ceiling 5 req/sec.
const MIN_INTERVAL_MS = 200;

// Roblox /v1/games and /v1/games/votes both cap at 50 universeIds per call.
export const UNIVERSE_BATCH_SIZE = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class TokenBucket {
  private last = 0;
  async take(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, this.last + MIN_INTERVAL_MS - now);
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
  }
}

const bucket = new TokenBucket();

interface FetchOpts {
  retries?: number;
  signal?: AbortSignal;
}

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

  for (let attempt = 0; attempt <= retries; attempt++) {
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
      const wait = retryAfter > 0 ? retryAfter * 1000 : backoff(attempt);
      if (attempt === retries) {
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
export async function getExploreSorts(
  sessionId: string,
  opts?: FetchOpts,
): Promise<ExploreSortsResponse> {
  const url = `https://apis.roblox.com/explore-api/v1/get-sorts?sessionId=${encodeURIComponent(sessionId)}`;
  return jget<ExploreSortsResponse>(url, opts);
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

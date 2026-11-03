import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { paywallOn } from "./paywall";

// Pro access is a Lemon Squeezy licence key, issued with each subscription and
// disabled by Lemon Squeezy when it ends. Subscribers paste it once on /pro
// (kept in a signed, httpOnly cookie) or send it as a bearer token to the API.

export const PRO_COOKIE = "pulse_pro";
export const PRO_COOKIE_MAX_AGE = 30 * 24 * 3600;
export const UPGRADE_URL = "https://pulse.shipfox.me/pro";
const VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";

function config() {
  return {
    storeId: Number(process.env.LEMON_STORE_ID),
    productId: Number(process.env.LEMON_PRODUCT_ID),
    secret: process.env.PRO_COOKIE_SECRET ?? "",
  };
}

// Until the store and secret are set, nothing unlocks: Pro stays locked rather than open.
export function proConfigured(): boolean {
  const c = config();
  return Number.isInteger(c.storeId) && c.storeId > 0 && Number.isInteger(c.productId) && c.productId > 0 && c.secret.length >= 32;
}

const KEY_RE = /^[A-Za-z0-9-]{8,100}$/;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface LicenceResult {
  valid: boolean;
  reason?: "malformed" | "not-configured" | "invalid" | "inactive" | "wrong-product";
}

interface ValidateResponse {
  valid?: boolean;
  license_key?: { status?: string } | null;
  meta?: { store_id?: number; product_id?: number } | null;
}

// Asks Lemon Squeezy whether a key is live and belongs to this store's Pro
// product. Network failures and 5xx throw, so they are never cached as "no".
export async function checkLicence(key: string, fetchImpl: typeof fetch = fetch): Promise<LicenceResult> {
  if (!KEY_RE.test(key)) return { valid: false, reason: "malformed" };
  if (!proConfigured()) return { valid: false, reason: "not-configured" };
  const res = await fetchImpl(VALIDATE_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ license_key: key }).toString(),
    cache: "no-store",
  });
  if (res.status >= 500) throw new Error(`Lemon Squeezy returned ${res.status}`);
  const body = (await res.json().catch(() => ({}))) as ValidateResponse;
  if (!body.valid) return { valid: false, reason: "invalid" };
  if (body.license_key?.status !== "active") return { valid: false, reason: "inactive" };
  const c = config();
  if (body.meta?.store_id !== c.storeId || body.meta?.product_id !== c.productId) return { valid: false, reason: "wrong-product" };
  return { valid: true };
}

// One Lemon Squeezy call per key per hour at most, shared across requests.
function cachedCheck(key: string): Promise<LicenceResult> {
  return unstable_cache(() => checkLicence(key), ["licence-v1", sha256(key)], { revalidate: 3600 })();
}

// The cookie holds the key with an HMAC, so it cannot be forged or edited.
export function signKey(key: string, secret = config().secret): string {
  const mac = createHmac("sha256", secret).update(key).digest("base64url");
  return `${Buffer.from(key).toString("base64url")}.${mac}`;
}

export function verifySigned(value: string | undefined, secret = config().secret): string | null {
  if (!value || !secret) return null;
  const [k, mac] = value.split(".");
  if (!k || !mac) return null;
  const key = Buffer.from(k, "base64url").toString();
  const expected = Buffer.from(createHmac("sha256", secret).update(key).digest("base64url"));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? key : null;
}

// A key from the Authorization header (API clients) or the signed cookie.
export function keyFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const cookie = req.headers.get("cookie") ?? "";
  const raw = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${PRO_COOKIE}=`))
    ?.slice(PRO_COOKIE.length + 1);
  return verifySigned(raw ? decodeURIComponent(raw) : undefined);
}

export async function isProKey(key: string | null): Promise<boolean> {
  // With the paywall off, everyone gets everything.
  if (!paywallOn()) return true;
  if (!key) return false;
  try {
    return (await cachedCheck(key)).valid;
  } catch (err) {
    console.error("[pro] licence check failed:", err);
    return false;
  }
}

// For server components: reads the signed cookie of the current request.
export async function isProSession(): Promise<boolean> {
  const value = (await cookies()).get(PRO_COOKIE)?.value;
  return isProKey(verifySigned(value));
}

// Form posts must come from this site, so another page cannot sign a
// visitor in or out behind their back.
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

// For API routes: null when the request may proceed, else the 402 to return.
export async function requirePro(req: Request): Promise<NextResponse | null> {
  if (await isProKey(keyFromRequest(req))) return null;
  return NextResponse.json(
    {
      error: "This endpoint is part of Roblox Pulse Pro. Send your licence key as 'Authorization: Bearer <key>'.",
      upgrade: UPGRADE_URL,
    },
    { status: 402, headers: { "Cache-Control": "private, no-store" } },
  );
}

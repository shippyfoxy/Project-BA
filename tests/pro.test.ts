import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkLicence, isProKey, keyFromRequest, PRO_COOKIE, requirePro, sameOrigin, signKey, verifySigned } from "@/lib/pro";

const SECRET = "x".repeat(40);
const KEY = "38b1460a-5104-4067-a91d-77b872934d51";

beforeAll(() => {
  process.env.LEMON_STORE_ID = "111";
  process.env.LEMON_PRODUCT_ID = "222";
  process.env.PRO_COOKIE_SECRET = SECRET;
  process.env.NEXT_PUBLIC_PAYWALL = "on";
});
afterAll(() => {
  delete process.env.LEMON_STORE_ID;
  delete process.env.LEMON_PRODUCT_ID;
  delete process.env.PRO_COOKIE_SECRET;
  delete process.env.NEXT_PUBLIC_PAYWALL;
});

const lemon = (body: object, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const ok = { valid: true, license_key: { status: "active" }, meta: { store_id: 111, product_id: 222 } };

describe("licence checks", () => {
  it("accepts an active key for this store's product", async () => {
    expect(await checkLicence(KEY, lemon(ok))).toEqual({ valid: true });
  });

  it("rejects cancelled, invalid, foreign and malformed keys", async () => {
    expect((await checkLicence(KEY, lemon({ ...ok, license_key: { status: "expired" } }))).reason).toBe("inactive");
    expect((await checkLicence(KEY, lemon({ valid: false, error: "license_key not found." }, 404))).reason).toBe("invalid");
    expect((await checkLicence(KEY, lemon({ ...ok, meta: { store_id: 999, product_id: 222 } }))).reason).toBe("wrong-product");
    expect((await checkLicence("not a key!", lemon(ok))).reason).toBe("malformed");
  });

  it("throws on provider outages so they are not cached as a no", async () => {
    await expect(checkLicence(KEY, lemon({}, 503))).rejects.toThrow();
  });
});

describe("the Pro cookie", () => {
  it("round-trips and refuses tampering", () => {
    const signed = signKey(KEY, SECRET);
    expect(verifySigned(signed, SECRET)).toBe(KEY);
    const [k] = signed.split(".");
    expect(verifySigned(`${k}.forged`, SECRET)).toBeNull();
    expect(verifySigned(signKey("other-key-123", SECRET).split(".")[0] + "." + signed.split(".")[1], SECRET)).toBeNull();
    expect(verifySigned(signed, "y".repeat(40))).toBeNull();
  });

  it("reads keys from a bearer header or the signed cookie", () => {
    expect(keyFromRequest(new Request("https://x.test/api", { headers: { authorization: `Bearer ${KEY}` } }))).toBe(KEY);
    const cookie = `a=1; ${PRO_COOKIE}=${encodeURIComponent(signKey(KEY, SECRET))}`;
    expect(keyFromRequest(new Request("https://x.test/api", { headers: { cookie } }))).toBe(KEY);
    expect(keyFromRequest(new Request("https://x.test/api", { headers: { cookie: `${PRO_COOKIE}=forged.value` } }))).toBeNull();
  });

  it("only accepts form posts from this site", () => {
    expect(sameOrigin(new Request("https://pulse.test/api/pro/activate", { headers: { origin: "https://pulse.test" } }))).toBe(true);
    expect(sameOrigin(new Request("https://pulse.test/api/pro/activate", { headers: { origin: "https://evil.test" } }))).toBe(false);
  });
});

describe("Pro API gate", () => {
  it("answers 402 with an upgrade link when there is no key", async () => {
    const res = await requirePro(new Request("https://pulse.test/api/v1/daily"));
    expect(res?.status).toBe(402);
    expect(res?.headers.get("cache-control")).toContain("no-store");
    expect((await res!.json()).upgrade).toContain("/pro");
  });
});

describe("with the paywall off", () => {
  it("lets everyone through", async () => {
    process.env.NEXT_PUBLIC_PAYWALL = "off";
    try {
      expect(await requirePro(new Request("https://pulse.test/api/v1/daily"))).toBeNull();
      expect(await isProKey(null)).toBe(true);
    } finally {
      process.env.NEXT_PUBLIC_PAYWALL = "on";
    }
  });
});

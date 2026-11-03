import { NextResponse, type NextRequest } from "next/server";
import { checkLicence, PRO_COOKIE, PRO_COOKIE_MAX_AGE, sameOrigin, signKey } from "@/lib/pro";

// The /pro form posts here. A valid key is stored in a signed cookie and the
// visitor is sent back to /pro with the outcome.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const key = String(form?.get("key") ?? "").trim();
  const back = (status: string) => NextResponse.redirect(new URL(`/pro?status=${status}`, req.url), 303);

  let result;
  try {
    result = await checkLicence(key);
  } catch (err) {
    console.error("[pro] activation check failed:", err);
    return back("unavailable");
  }
  if (!result.valid) return back(result.reason ?? "invalid");

  const res = back("active");
  res.cookies.set(PRO_COOKIE, signKey(key), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PRO_COOKIE_MAX_AGE,
  });
  return res;
}

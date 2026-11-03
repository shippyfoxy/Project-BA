import { NextResponse, type NextRequest } from "next/server";
import { PRO_COOKIE, sameOrigin } from "@/lib/pro";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const res = NextResponse.redirect(new URL("/pro?status=signed-out", req.url), 303);
  res.cookies.delete(PRO_COOKIE);
  return res;
}

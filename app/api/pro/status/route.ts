import { NextResponse, type NextRequest } from "next/server";
import { isProKey, keyFromRequest } from "@/lib/pro";

// Lets cached pages reveal Pro figures in the browser after the server has
// checked the visitor's key. Never cached: the answer is per visitor.
export async function GET(req: NextRequest) {
  const pro = await isProKey(keyFromRequest(req));
  return NextResponse.json({ pro }, { headers: { "Cache-Control": "private, no-store" } });
}

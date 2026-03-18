import { NextResponse } from "next/server";
import { d1GetAll, isD1Configured } from "@/lib/d1";
import { logError } from "@/lib/errorLog";

export const runtime = "nodejs";

/**
 * GET /api/d1-sync
 * Returns all key-value pairs from D1 for a full client-side sync.
 * D1 data should be treated as source of truth; clients overwrite localStorage.
 */
export async function GET() {
  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  try {
    const all = await d1GetAll();
    return NextResponse.json(all);
  } catch (error) {
    logError({ route: "/api/d1-sync GET", error });
    return NextResponse.json({ error: "D1 sync failed" }, { status: 500 });
  }
}

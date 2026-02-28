import { NextRequest, NextResponse } from "next/server";
import { d1Get, d1GetAll, d1Set, d1Delete, isD1Configured } from "@/lib/d1";
import { logError } from "@/lib/errorLog";

export const runtime = "nodejs";

/**
 * GET /api/db          → return all key-value pairs (initial sync)
 * GET /api/db?key=...  → return single key's value
 */
export async function GET(request: NextRequest) {
  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  const key = request.nextUrl.searchParams.get("key");

  try {
    if (key) {
      const value = await d1Get(key);
      if (value === null) {
        return NextResponse.json({ error: "Key not found" }, { status: 404 });
      }
      return NextResponse.json({ key, value });
    }

    // Return all key-value pairs
    const all = await d1GetAll();
    return NextResponse.json(all);
  } catch (error) {
    logError({ route: "/api/db GET", error });
    return NextResponse.json({ error: "D1 query failed" }, { status: 500 });
  }
}

/**
 * PUT /api/db
 * Body: { key: string, value: string }
 * Auth: enforced by middleware (session or x-admin-password).
 */
export async function PUT(request: NextRequest) {
  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { key, value } = body as { key: string; value: string };

    if (!key || typeof value !== "string") {
      return NextResponse.json(
        { error: "key and value (string) are required" },
        { status: 400 }
      );
    }

    await d1Set(key, value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError({ route: "/api/db PUT", error });
    return NextResponse.json({ error: "D1 write failed" }, { status: 500 });
  }
}

/**
 * DELETE /api/db?key=...
 * Resets the key's value to '[]' in D1.
 * Auth: enforced by middleware (session or x-admin-password).
 */
export async function DELETE(request: NextRequest) {
  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  try {
    await d1Delete(key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError({ route: "/api/db DELETE", error });
    return NextResponse.json({ error: "D1 delete failed" }, { status: 500 });
  }
}

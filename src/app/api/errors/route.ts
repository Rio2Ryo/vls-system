import { NextRequest, NextResponse } from "next/server";
import {
  isD1Configured,
  insertErrorLog,
  getErrorLogs,
  clearErrorLogs,
  ensureErrorLogsTable,
} from "@/lib/d1";

export const runtime = "nodejs";

/**
 * POST /api/errors — Ingest a client-side error log entry.
 * No auth required (error reporting should always work).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const id = `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const row = {
      id,
      timestamp: typeof body.timestamp === "number" ? body.timestamp : Date.now(),
      route: String(body.route || body.context || "unknown").slice(0, 200),
      error: String(body.error || body.message || "Unknown error").slice(0, 1000),
      stack: body.stack ? String(body.stack).slice(0, 3000) : undefined,
      userId: body.userId ? String(body.userId).slice(0, 100) : undefined,
      source:
        body.source === "server" || body.source === "edge" ? body.source : "client",
      url: body.url ? String(body.url).slice(0, 500) : undefined,
      userAgent: body.userAgent ? String(body.userAgent).slice(0, 300) : undefined,
    };

    // Always log to server console
    console.error(`[VLS Error][${row.source}] ${row.route}: ${row.error}`);

    // Persist to D1 error_logs table
    if (isD1Configured()) {
      await insertErrorLog(row);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[VLS Error] Failed to ingest error log:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

/**
 * GET /api/errors — Retrieve error logs for admin.
 */
export async function GET() {
  if (!isD1Configured()) {
    return NextResponse.json([]);
  }

  try {
    await ensureErrorLogsTable();
    const rows = await getErrorLogs(200);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[VLS Error] Failed to read error log:", err);
    return NextResponse.json([]);
  }
}

/**
 * DELETE /api/errors — Clear all error logs.
 */
export async function DELETE() {
  if (!isD1Configured()) {
    return NextResponse.json({ ok: true });
  }

  try {
    await clearErrorLogs();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[VLS Error] Failed to clear error log:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

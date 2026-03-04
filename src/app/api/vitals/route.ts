import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    // In production, forward to your analytics service (e.g., D1, BigQuery, etc.)
    // For now, log server-side for monitoring
    if (process.env.NODE_ENV === "development") {
      console.log("[WebVitals]", data);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

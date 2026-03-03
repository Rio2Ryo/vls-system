import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/d1/database/${process.env.D1_DATABASE_ID}`;
const headers = {
  Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
  "Content-Type": "application/json",
};

// GET: fetch behavior events from D1
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("eventId");

  try {
    const res = await fetch(`${D1_URL}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sql: "SELECT value FROM kv_store WHERE key = ?",
        params: ["vls_behavior_events"],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ events: [] });
    }

    const data = await res.json();
    const row = data?.result?.[0]?.results?.[0];
    if (!row?.value) {
      return NextResponse.json({ events: [] });
    }

    let events = JSON.parse(row.value);

    // Filter by eventId if specified
    if (eventId) {
      events = events.filter((e: { eventId: string }) => e.eventId === eventId);
    }

    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ events: [] });
  }
}

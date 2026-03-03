import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/d1/database/${process.env.D1_DATABASE_ID}`;
const headers = {
  Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
  "Content-Type": "application/json",
};

// GET: fetch offer interactions from D1
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("eventId");
  const companyId = req.nextUrl.searchParams.get("companyId");

  try {
    const res = await fetch(`${D1_URL}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sql: "SELECT value FROM kv_store WHERE key = ?",
        params: ["vls_offer_interactions"],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ interactions: [] });
    }

    const data = await res.json();
    const row = data?.result?.[0]?.results?.[0];
    if (!row?.value) {
      return NextResponse.json({ interactions: [] });
    }

    let interactions = JSON.parse(row.value);

    if (eventId) {
      interactions = interactions.filter((i: { eventId: string }) => i.eventId === eventId);
    }
    if (companyId) {
      interactions = interactions.filter((i: { companyId: string }) => i.companyId === companyId);
    }

    return NextResponse.json({ interactions });
  } catch {
    return NextResponse.json({ interactions: [] });
  }
}

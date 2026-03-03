import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/nps — return all NPS responses (admin use)
 * POST /api/nps — submit an NPS score (public, token-based)
 */

// GET: fetch all NPS data from D1
export async function GET(req: NextRequest) {
  try {
    const dbRes = await fetch(new URL("/api/db?key=vls_nps_responses", req.url));
    if (!dbRes.ok) return NextResponse.json([]);
    const data = await dbRes.json();
    const responses = data.value ? JSON.parse(data.value) : [];
    return NextResponse.json(responses);
  } catch {
    return NextResponse.json([]);
  }
}

// POST: submit NPS score by token
export async function POST(req: NextRequest) {
  let body: { token: string; score: number; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, score, comment } = body;
  if (!token || score === undefined || score === null) {
    return NextResponse.json({ error: "token and score required" }, { status: 400 });
  }
  if (typeof score !== "number" || score < 0 || score > 10) {
    return NextResponse.json({ error: "score must be 0-10" }, { status: 400 });
  }

  try {
    // Fetch existing NPS data
    const dbRes = await fetch(new URL("/api/db?key=vls_nps_responses", req.url));
    let responses: Array<{
      token: string;
      score?: number;
      comment?: string;
      respondedAt?: number;
      expiresAt: number;
    }> = [];
    if (dbRes.ok) {
      const data = await dbRes.json();
      if (data.value) responses = JSON.parse(data.value);
    }

    const idx = responses.findIndex((r) => r.token === token);
    if (idx === -1) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    // Check expiry
    if (Date.now() > responses[idx].expiresAt) {
      return NextResponse.json({ error: "Token expired" }, { status: 410 });
    }

    // Check already responded
    if (responses[idx].respondedAt) {
      return NextResponse.json({ error: "Already responded" }, { status: 409 });
    }

    // Update response
    responses[idx] = {
      ...responses[idx],
      score,
      comment: comment || undefined,
      respondedAt: Date.now(),
    };

    // Save back to D1
    await fetch(new URL("/api/db", req.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "vls_nps_responses", value: JSON.stringify(responses) }),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

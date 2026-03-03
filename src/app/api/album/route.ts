import { NextRequest, NextResponse } from "next/server";
import { AlbumShare } from "@/lib/types";

const KV_KEY = "vls_album_shares";

interface AlbumCreateRequest {
  eventId: string;
  eventName: string;
  photoIds: string[];
  creatorName: string;
  sponsorIds: string[];
  matchedCompanyId?: string;
}

/**
 * POST — Create a new album share link (30-day expiry).
 * Same pattern as /api/send-download-link (token + D1 KV).
 */
export async function POST(req: NextRequest) {
  let body: AlbumCreateRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { eventId, eventName, photoIds, creatorName, sponsorIds, matchedCompanyId } = body;
  if (!eventId || !eventName || !photoIds?.length || !creatorName) {
    return NextResponse.json(
      { error: "eventId, eventName, photoIds, creatorName required" },
      { status: 400 }
    );
  }

  const token = crypto.randomUUID();
  const now = Date.now();
  const record: AlbumShare = {
    id: `album-${now}-${Math.random().toString(36).slice(2, 6)}`,
    token,
    eventId,
    eventName,
    photoIds,
    creatorName,
    sponsorIds: sponsorIds || [],
    matchedCompanyId,
    createdAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
    viewCount: 0,
  };

  // Save to D1 KV
  try {
    const existingRes = await fetch(new URL(`/api/db?key=${KV_KEY}`, req.url));
    let shares: AlbumShare[] = [];
    if (existingRes.ok) {
      const data = await existingRes.json();
      if (data.value) {
        shares = JSON.parse(data.value);
      }
    }
    shares.push(record);

    await fetch(new URL("/api/db", req.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: KV_KEY, value: JSON.stringify(shares) }),
    });
  } catch {
    return NextResponse.json({ error: "Failed to save album share" }, { status: 500 });
  }

  return NextResponse.json({ success: true, token, expiresAt: record.expiresAt });
}

/**
 * GET — Validate album token, increment view counter, return album data.
 * GET /api/album?token=xxx
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  try {
    const dbRes = await fetch(new URL(`/api/db?key=${KV_KEY}`, req.url));
    if (!dbRes.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const data = await dbRes.json();
    if (!data.value) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const shares: AlbumShare[] = JSON.parse(data.value);
    const idx = shares.findIndex((s) => s.token === token);

    if (idx === -1) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    const record = shares[idx];

    if (record.expiresAt < Date.now()) {
      return NextResponse.json({ error: "Token expired" }, { status: 410 });
    }

    // Increment view count and write back
    shares[idx] = { ...record, viewCount: record.viewCount + 1 };
    try {
      await fetch(new URL("/api/db", req.url), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: KV_KEY, value: JSON.stringify(shares) }),
      });
    } catch {
      // View count update failed — continue serving album
    }

    return NextResponse.json({
      eventId: record.eventId,
      eventName: record.eventName,
      photoIds: record.photoIds,
      creatorName: record.creatorName,
      expiresAt: record.expiresAt,
      viewCount: record.viewCount + 1,
      sponsorIds: record.sponsorIds,
      matchedCompanyId: record.matchedCompanyId,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

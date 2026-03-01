import { NextRequest, NextResponse } from "next/server";

interface DownloadRecord {
  id: string;
  eventId: string;
  photoIds: string[];
  name: string;
  email: string;
  token: string;
  expiresAt: number;
  sentAt: number;
  createdAt: number;
}

/**
 * Validate download token and return photo info.
 * GET /api/download-link?token=xxx
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  // Read from D1 KV
  try {
    const dbRes = await fetch(new URL("/api/db?key=vls_download_requests", req.url));
    if (!dbRes.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const data = await dbRes.json();
    if (!data.value) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const requests: DownloadRecord[] = JSON.parse(data.value);
    const record = requests.find((r) => r.token === token);

    if (!record) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    if (record.expiresAt < Date.now()) {
      return NextResponse.json({ error: "Token expired" }, { status: 410 });
    }

    return NextResponse.json({
      name: record.name,
      eventId: record.eventId,
      photoIds: record.photoIds,
      expiresAt: record.expiresAt,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

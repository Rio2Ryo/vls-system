import { NextRequest, NextResponse } from "next/server";
import { d1Query } from "@/lib/d1";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const label = searchParams.get("label") || "insightface-poc";
  const limit = Math.min(Number(searchParams.get("limit") || "100"), 500);

  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  const rows = await d1Query(
    `SELECT id, event_id, photo_id, face_index, label, created_at, bbox
     FROM face_embeddings
     WHERE event_id = ? AND label = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [eventId, label, limit]
  );

  return NextResponse.json({ rows, count: rows.length });
}

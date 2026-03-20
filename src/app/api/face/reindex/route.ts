import { NextRequest, NextResponse } from "next/server";
import { isD1Configured, deleteFaceEmbeddingsByEvent } from "@/lib/d1";

/**
 * DELETE /api/face/reindex
 *
 * Deletes all face embeddings for an event so the client can re-run face detection.
 * After calling this endpoint, the client should re-run indexBatchPhotoFaces() on all photos.
 *
 * Body: { eventId: string }
 * Returns: { ok, deleted }
 */
export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = body.eventId as string | undefined;
  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  const deleted = await deleteFaceEmbeddingsByEvent(eventId);
  return NextResponse.json({ ok: true, deleted });
}

import { NextRequest, NextResponse } from "next/server";
import { isD1Configured, insertFaceEmbedding, getFaceEmbeddingsByPhoto } from "@/lib/d1";
import type { FaceBox } from "@/lib/face";

/**
 * POST /api/face/index
 *
 * Called after photo upload to store face embeddings for a photo.
 * Designed to be called by the client after running face-api.js in the browser.
 *
 * Body:
 *   eventId:  string  — event the photo belongs to
 *   photoId:  string  — unique photo ID
 *   faces:    Array<{
 *     faceIndex:  number
 *     embedding:  number[]  — 128-dim face descriptor
 *     bbox?:      { x, y, width, height }  — bounding box (pixels)
 *     score?:     number    — detection confidence
 *     label?:     string    — optional face label / description
 *   }>
 *
 * Returns: { ok, indexed, skipped, total }
 */

interface IndexFace {
  faceIndex: number;
  embedding: number[];
  bbox?: FaceBox;
  score?: number;
  label?: string;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = body.eventId as string | undefined;
  const photoId = body.photoId as string | undefined;
  const faces = body.faces as IndexFace[] | undefined;

  if (!eventId || !photoId) {
    return NextResponse.json(
      { error: "eventId and photoId required" },
      { status: 400 },
    );
  }

  if (!faces || !Array.isArray(faces) || faces.length === 0) {
    return NextResponse.json({ ok: true, indexed: 0, skipped: 0, total: 0 });
  }

  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  // Check if this photo already has embeddings (idempotent — skip duplicates)
  const existing = await getFaceEmbeddingsByPhoto(photoId);
  if (existing.length > 0) {
    return NextResponse.json({
      ok: true,
      indexed: 0,
      skipped: existing.length,
      total: existing.length,
      message: "Photo already indexed",
    });
  }

  let indexed = 0;
  let skipped = 0;

  for (const face of faces) {
    // Validate embedding dimension (face-api.js produces 128-dim)
    if (
      !Array.isArray(face.embedding) ||
      face.embedding.length === 0 ||
      face.embedding.some((v) => typeof v !== "number" || !isFinite(v))
    ) {
      skipped++;
      continue;
    }

    const id = `${photoId}_face${face.faceIndex}`;
    await insertFaceEmbedding({
      id,
      eventId,
      photoId,
      faceIndex: face.faceIndex,
      embedding: face.embedding,
      bbox: face.bbox,
      label: face.label,
    });
    indexed++;
  }

  return NextResponse.json({
    ok: true,
    indexed,
    skipped,
    total: indexed + skipped,
  });
}

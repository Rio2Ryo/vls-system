import { NextRequest, NextResponse } from "next/server";
import {
  isD1Configured,
  getFaceEmbeddingsByEvent,
  insertFaceSearchSession,
} from "@/lib/d1";
import { euclideanDistance, type FaceBox, type FaceSearchResult } from "@/lib/face";

/**
 * POST /api/face/search
 *
 * Euclidean-distance search across all face embeddings in an event.
 * face-api.js (dlib-based) descriptors must be compared with Euclidean distance,
 * not cosine similarity. Same person: distance < 0.6 (dlib default threshold).
 *
 * Body:
 *   queryEmbedding: number[]   — 128-dim face descriptor from face-api.js
 *   eventId:        string     — target event
 *   threshold?:     number     — max Euclidean distance to match (default 0.5, range 0.1–2.0)
 *   limit?:         number     — max results (default 50, max 200)
 *   userId?:        string     — optional caller ID for session log
 *
 * Returns:
 *   { sessionId, matchCount, uniquePhotos, results: FaceSearchResult[] }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const queryEmbedding = body.queryEmbedding as number[] | undefined;
  const eventId = body.eventId as string | undefined;
  // Euclidean distance threshold: face-api.js uses dlib descriptors designed for
  // Euclidean distance comparison. Same person = distance < 0.6 (dlib default).
  // Default 0.5 gives stricter matching; client may override (e.g. 0.45 for tighter).
  const rawThreshold = Number(body.threshold) || 0.5;
  const threshold = Math.max(0.1, Math.min(2.0, rawThreshold));
  const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
  const userId = (body.userId as string) || undefined;

  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json({ error: "eventId (string) required" }, { status: 400 });
  }
  if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return NextResponse.json(
      { error: "queryEmbedding (number[]) required" },
      { status: 400 },
    );
  }

  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  // Fetch all event embeddings
  const rows = await getFaceEmbeddingsByEvent(eventId);
  if (rows.length === 0) {
    return NextResponse.json({
      sessionId: null,
      matchCount: 0,
      uniquePhotos: 0,
      results: [],
    });
  }

  // Compute similarities using Euclidean distance (face-api.js / dlib standard).
  // Lower distance = more similar. Threshold: < 0.5 same person, > 0.6 different.
  // Convert distance to a 0-1 similarity score for display: 1 - distance/2.0
  const results: FaceSearchResult[] = [];
  for (const row of rows) {
    const stored = JSON.parse(row.embedding as string) as number[];
    const distance = euclideanDistance(queryEmbedding, stored);
    if (distance <= threshold) {
      // Map distance to [0,1]: distance 0 → 1.0 (perfect), distance 2 → 0.0 (max diff)
      const similarity = Math.max(0, 1 - distance / 2.0);
      results.push({
        photoId: row.photo_id as string,
        faceId: row.id as string,
        similarity: Math.round(similarity * 10000) / 10000,
        bbox: row.bbox ? (JSON.parse(row.bbox as string) as FaceBox) : undefined,
      });
    }
  }
  results.sort((a, b) => b.similarity - a.similarity);
  const limited = results.slice(0, limit);

  // Unique photo IDs
  const uniquePhotos = new Set(limited.map((r) => r.photoId)).size;

  // Persist search session
  const sessionId = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await insertFaceSearchSession({
      id: sessionId,
      userId,
      eventId,
      queryEmbedding,
      results: limited,
      threshold,
    });
  } catch {
    // Non-critical — log but don't fail the response
    console.error("Failed to save face search session");
  }

  return NextResponse.json({
    sessionId,
    matchCount: limited.length,
    uniquePhotos,
    results: limited,
  });
}

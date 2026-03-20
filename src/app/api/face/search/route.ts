import { NextRequest, NextResponse } from "next/server";
import {
  isD1Configured,
  getFaceEmbeddingsByEvent,
  insertFaceSearchSession,
} from "@/lib/d1";
import { cosineSimilarity, type FaceBox, type FaceSearchResult } from "@/lib/face";

/**
 * POST /api/face/search
 *
 * Cosine-similarity search across all face embeddings in an event.
 * Threshold 0.5: same person when cosine similarity >= 0.5.
 *
 * Body:
 *   queryEmbedding: number[]   — 128-dim face descriptor from face-api.js
 *   eventId:        string     — target event
 *   threshold?:     number     — min cosine similarity to match (default 0.5, range 0.0–1.0)
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
  // Cosine similarity threshold: >= 0.5 considered same person.
  const rawThreshold = Number(body.threshold) || 0.5;
  const threshold = Math.max(0.0, Math.min(1.0, rawThreshold));
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

  // Compute cosine similarity. Higher = more similar. Threshold >= 0.5 = same person.
  const results: FaceSearchResult[] = [];
  for (const row of rows) {
    const stored = JSON.parse(row.embedding as string) as number[];
    const similarity = cosineSimilarity(queryEmbedding, stored);
    if (similarity >= threshold) {
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

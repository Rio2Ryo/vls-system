import { NextRequest, NextResponse } from "next/server";
import {
  isD1Configured,
  getFaceEmbeddingsByEvent,
  insertFaceSearchSession,
} from "@/lib/d1";
import { cosineSimilarity, type FaceBox, type FaceSearchResult } from "@/lib/face";
import { generateImageEmbedding, isCfAiConfigured } from "@/lib/cf-ai";

/**
 * POST /api/face/search
 *
 * Cosine-similarity search across all face embeddings in an event.
 *
 * Body (two modes):
 *   Mode A — CF Workers AI (preferred):
 *     imageBase64: string     — base64 encoded image (with or without data URL prefix)
 *     eventId:     string
 *     threshold?:  number     — min cosine similarity (default 0.5)
 *     limit?:      number     — max results (default 50, max 200)
 *     userId?:     string
 *
 *   Mode B — direct embedding (legacy / fallback):
 *     queryEmbedding: number[]
 *     eventId:        string
 *     threshold?:     number
 *     limit?:         number
 *     userId?:        string
 *
 * Returns:
 *   { sessionId, matchCount, uniquePhotos, results: FaceSearchResult[] }
 *   or on CF AI failure: { error, fallbackRequired: true }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const imageBase64 = body.imageBase64 as string | undefined;
  const rawEmbedding = body.queryEmbedding as number[] | undefined;
  const eventId = body.eventId as string | undefined;
  const rawThreshold = Number(body.threshold) || 0.5;
  const threshold = Math.max(0.0, Math.min(1.0, rawThreshold));
  const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
  const userId = (body.userId as string) || undefined;

  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json({ error: "eventId (string) required" }, { status: 400 });
  }
  if (!imageBase64 && (!rawEmbedding || !Array.isArray(rawEmbedding) || rawEmbedding.length === 0)) {
    return NextResponse.json(
      { error: "imageBase64 or queryEmbedding required" },
      { status: 400 },
    );
  }
  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  // Resolve embedding: prefer CF AI from imageBase64, fall back to direct queryEmbedding
  let queryEmbedding: number[];
  if (imageBase64) {
    if (!isCfAiConfigured()) {
      // CF AI not configured — signal client to fall back to face-api.js
      return NextResponse.json(
        { error: "CF Workers AI not configured", fallbackRequired: true },
        { status: 503 },
      );
    }
    try {
      queryEmbedding = await generateImageEmbedding(imageBase64);
    } catch (err) {
      console.error("[face/search] CF AI embedding failed:", err);
      return NextResponse.json(
        { error: `CF Workers AI failed: ${String(err)}`, fallbackRequired: true },
        { status: 502 },
      );
    }
  } else {
    queryEmbedding = rawEmbedding!;
  }

  // Fetch all event embeddings from D1
  const rows = await getFaceEmbeddingsByEvent(eventId);
  if (rows.length === 0) {
    return NextResponse.json({
      sessionId: null,
      matchCount: 0,
      uniquePhotos: 0,
      results: [],
    });
  }

  // Compute cosine similarity
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

  const uniquePhotos = new Set(limited.map((r) => r.photoId)).size;

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
    console.error("Failed to save face search session");
  }

  return NextResponse.json({
    sessionId,
    matchCount: limited.length,
    uniquePhotos,
    results: limited,
  });
}

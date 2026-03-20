import { NextRequest, NextResponse } from "next/server";
import { isD1Configured, getFaceEmbeddingsByEvent, ensureFaceTables } from "@/lib/d1";
import { euclideanDistance } from "@/lib/face";

/**
 * POST /api/face/test-search
 *
 * Test face search accuracy: given a query embedding, search D1 for matches
 * and return detailed results for accuracy verification.
 *
 * Body: { eventId: string, embedding: number[], threshold?: number }
 * Returns: { matchCount, uniquePhotos, totalEmbeddings, results, scoreDistribution }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = body.eventId as string | undefined;
  const embedding = body.embedding as number[] | undefined;
  const threshold = (body.threshold as number | undefined) ?? 0.5;

  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }
  if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
    return NextResponse.json({ error: "embedding required" }, { status: 400 });
  }

  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  await ensureFaceTables();
  const rows = await getFaceEmbeddingsByEvent(eventId);

  if (rows.length === 0) {
    return NextResponse.json({
      matchCount: 0,
      uniquePhotos: 0,
      totalEmbeddings: 0,
      results: [],
      scoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
      message: "No embeddings found for this event. Please reindex first.",
    });
  }

  // Compute distances for all stored embeddings
  const scored: Array<{ photoId: string; faceIndex: number; distance: number }> = [];

  for (const row of rows) {
    try {
      const storedEmbedding = JSON.parse(row.embedding as string) as number[];
      if (!Array.isArray(storedEmbedding) || storedEmbedding.length === 0) continue;

      const distance = euclideanDistance(embedding, storedEmbedding);
      scored.push({
        photoId: row.photo_id as string,
        faceIndex: row.face_index as number,
        distance,
      });
    } catch {
      continue;
    }
  }

  // Sort by distance ascending (closest = best match)
  scored.sort((a, b) => a.distance - b.distance);

  // Apply threshold filter
  const matches = scored.filter((r) => r.distance <= threshold);
  const uniquePhotos = new Set(matches.map((r) => r.photoId)).size;

  // Score distribution across ALL embeddings (not just matches)
  const scoreDistribution = {
    excellent: scored.filter((r) => r.distance <= 0.3).length,  // very close
    good: scored.filter((r) => r.distance > 0.3 && r.distance <= 0.5).length,
    fair: scored.filter((r) => r.distance > 0.5 && r.distance <= 0.7).length,
    poor: scored.filter((r) => r.distance > 0.7).length,
  };

  // Top results (limit to top 50 for display)
  const topResults = scored.slice(0, 50).map((r) => ({
    photoId: r.photoId,
    faceIndex: r.faceIndex,
    distance: Math.round(r.distance * 1000) / 1000,
    matched: r.distance <= threshold,
  }));

  return NextResponse.json({
    matchCount: matches.length,
    uniquePhotos,
    totalEmbeddings: rows.length,
    threshold,
    results: topResults,
    scoreDistribution,
  });
}

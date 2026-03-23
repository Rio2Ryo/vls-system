import { NextRequest, NextResponse } from "next/server";
import { d1Query } from "@/lib/d1";

export const runtime = "nodejs";
export const maxDuration = 60;
// rollback marker: keep route on queryEmbedding-only path for production safety

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = body.eventId as string | undefined;
  const queryEmbedding = body.queryEmbedding as number[] | undefined;
  const threshold = Number(body.threshold ?? 0.17);
  const limit = Number(body.limit ?? 12);

  if (!eventId || !queryEmbedding || !Array.isArray(queryEmbedding)) {
    return NextResponse.json({ error: "eventId and queryEmbedding required" }, { status: 400 });
  }

  const rows = await d1Query(
    "SELECT id, photo_id, embedding, bbox FROM face_embeddings WHERE event_id = ? AND label = ? ORDER BY photo_id, face_index",
    [eventId, "insightface-poc"]
  );

  const scored = rows.map((r) => {
    const embedding = JSON.parse(r.embedding as string) as number[];
    return {
      photoId: r.photo_id as string,
      faceId: r.id as string,
      similarity: Number(cosine(queryEmbedding, embedding).toFixed(4)),
      bbox: r.bbox ? JSON.parse(r.bbox as string) : undefined,
    };
  }).filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  const dedup = [] as typeof scored;
  const seen = new Set<string>();
  for (const r of scored) {
    if (seen.has(r.photoId)) continue;
    seen.add(r.photoId);
    dedup.push(r);
    if (dedup.length >= limit) break;
  }

  return NextResponse.json({
    provider: "insightface-poc-node-search",
    threshold,
    matchCount: dedup.length,
    results: dedup,
  });
}

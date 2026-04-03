import { NextRequest, NextResponse } from "next/server";
import { d1Query } from "@/lib/d1";

export const runtime = "nodejs";
export const maxDuration = 60;

const INSIGHTFACE_API_URL = process.env.INSIGHTFACE_API_URL || "http://localhost:7860";

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
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * Convert a data URL or raw base64 string to a Buffer.
 */
function base64ToBuffer(b64: string): Buffer {
  const dataUrlMatch = b64.match(/^data:[^;]+;base64,(.+)$/);
  return Buffer.from(dataUrlMatch ? dataUrlMatch[1] : b64, "base64");
}

/**
 * Call InsightFace API /embed endpoint with an image buffer.
 * Returns array of face embeddings (512-dim each).
 */
async function getInsightFaceEmbeddings(imageBuffer: Buffer): Promise<number[][]> {
  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" }), "query.jpg");

  const res = await fetch(`${INSIGHTFACE_API_URL}/embed`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`InsightFace API error: ${res.status}`);
  }

  const data = await res.json() as { faces: Array<{ embedding: number[] }>; count: number };
  return data.faces.map((f) => f.embedding);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = body.eventId as string | undefined;
  let queryEmbedding = body.queryEmbedding as number[] | undefined;
  const imageBase64 = body.imageBase64 as string | undefined;
  const threshold = Number(body.threshold ?? 0.3);
  const limit = Number(body.limit ?? 50);

  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  // If imageBase64 is provided, call InsightFace API to get embedding
  if (imageBase64 && !queryEmbedding) {
    try {
      const buf = base64ToBuffer(imageBase64);
      const embeddings = await getInsightFaceEmbeddings(buf);
      if (embeddings.length === 0) {
        return NextResponse.json({
          error: "No face detected in uploaded image",
          matchCount: 0,
          results: [],
        }, { status: 200 });
      }
      // Use the first face's embedding
      queryEmbedding = embeddings[0];
    } catch (e) {
      console.error("[search-insightface] InsightFace API error:", e);
      return NextResponse.json({
        error: `InsightFace API unavailable: ${e instanceof Error ? e.message : String(e)}`,
        matchCount: 0,
        results: [],
      }, { status: 200 });
    }
  }

  if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
    return NextResponse.json({ error: "eventId and (imageBase64 or queryEmbedding) required" }, { status: 400 });
  }

  // Query D1 for InsightFace embeddings
  const rows = await d1Query(
    "SELECT id, photo_id, embedding, bbox FROM face_embeddings WHERE event_id = ? AND label = ? ORDER BY photo_id, face_index",
    [eventId, "insightface-poc"]
  );

  if (rows.length === 0) {
    return NextResponse.json({
      error: "No InsightFace embeddings in database. Please run reindex first.",
      matchCount: 0,
      results: [],
      _debug: { storedEmbeddings: 0, label: "insightface-poc" },
    });
  }

  const scored = rows.map((r) => {
    const embedding = JSON.parse(r.embedding as string) as number[];
    return {
      photoId: r.photo_id as string,
      faceId: r.id as string,
      similarity: Number(cosine(queryEmbedding!, embedding).toFixed(4)),
      bbox: r.bbox ? JSON.parse(r.bbox as string) : undefined,
    };
  }).filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  // Deduplicate by photoId (keep best score per photo)
  const dedup = [] as typeof scored;
  const seen = new Set<string>();
  for (const r of scored) {
    if (seen.has(r.photoId)) continue;
    seen.add(r.photoId);
    dedup.push(r);
    if (dedup.length >= limit) break;
  }

  return NextResponse.json({
    provider: "insightface",
    threshold,
    matchCount: dedup.length,
    results: dedup,
    _debug: { storedEmbeddings: rows.length, queryDim: queryEmbedding.length },
  });
}

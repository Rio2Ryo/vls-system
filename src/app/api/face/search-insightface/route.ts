import { NextRequest, NextResponse } from "next/server";
import { d1Query } from "@/lib/d1";

export const runtime = "nodejs";
export const maxDuration = 60;

const FACENET_API_URL = process.env.FACENET_API_URL || process.env.INSIGHTFACE_API_URL || "https://ryosukematsuura-face-test-0409.hf.space";
const HF_TOKEN = process.env.HF_TOKEN || "";

// Use dot product for similarity (embeddings are L2-normalized, same as standalone's np.dot)
function dotSimilarity(a: number[], b: number[]) {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

function dedupeByPhoto<T extends { photoId: string }>(rows: T[], limit: number): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const row of rows) {
    if (seen.has(row.photoId)) continue;
    seen.add(row.photoId);
    deduped.push(row);
    if (deduped.length >= limit) break;
  }
  return deduped;
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
type FaceNetFace = { embedding: number[]; bbox: number[]; det_score: number };

async function getFaceNetEmbeddings(imageBuffer: Buffer): Promise<FaceNetFace[]> {
  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" }), "query.jpg");

  const res = await fetch(`${FACENET_API_URL}/embed`, {
    method: "POST",
    headers: {
      ...(HF_TOKEN ? { "Authorization": `Bearer ${HF_TOKEN}` } : {}),
    },
    body: formData,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`FaceNet API error: ${res.status}`);
  }

  const data = await res.json() as { faces: Array<{ embedding: number[]; bbox: number[]; det_score: number }>; count: number };
  // Filter low-confidence faces
  return data.faces.filter(f => f.det_score >= 0.5);
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
  // Support multiple images for higher accuracy (up to 3)
  const imagesBase64 = body.imagesBase64 as string[] | undefined;
  const threshold = Number(body.threshold ?? 0.4);
  const limit = Number(body.limit ?? 200);

  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  // Build list of images to process
  const imagesToProcess: string[] = [];
  if (imagesBase64 && imagesBase64.length > 0) {
    imagesToProcess.push(...imagesBase64.slice(0, 3));
  } else if (imageBase64) {
    imagesToProcess.push(imageBase64);
  }

  // If images provided, call FaceNet API to get embeddings and average them
  if (imagesToProcess.length > 0 && !queryEmbedding) {
    try {
      const allEmbeddings: number[][] = [];
      for (const img of imagesToProcess) {
        const buf = base64ToBuffer(img);
        const faces = await getFaceNetEmbeddings(buf);
        if (faces.length > 0) {
          // Use face with highest detection score (matches standalone app behavior)
          const best = faces.reduce((bestF, f) => f.det_score > bestF.det_score ? f : bestF);
          allEmbeddings.push(best.embedding);
        }
      }
      if (allEmbeddings.length === 0) {
        return NextResponse.json({
          error: "No face detected in uploaded image(s)",
          matchCount: 0,
          results: [],
        }, { status: 200 });
      }
      // Average embeddings across all images for higher accuracy
      if (allEmbeddings.length === 1) {
        queryEmbedding = allEmbeddings[0];
      } else {
        const dim = allEmbeddings[0].length;
        const avg = new Array(dim).fill(0) as number[];
        for (const emb of allEmbeddings) {
          for (let i = 0; i < dim; i++) avg[i] += emb[i];
        }
        const norm = Math.sqrt(avg.reduce((s, v) => s + v * v, 0)) || 1;
        queryEmbedding = avg.map((v) => v / norm);
      }
    } catch (e) {
      console.error("[search-insightface] InsightFace API error:", e);
      return NextResponse.json({
        error: `FaceNet API unavailable: ${e instanceof Error ? e.message : String(e)}`,
        matchCount: 0,
        results: [],
      }, { status: 200 });
    }
  }

  if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
    return NextResponse.json({ error: "eventId and (imageBase64 or queryEmbedding) required" }, { status: 400 });
  }

  // Query D1 for FaceNet embeddings
  const rows = await d1Query(
    "SELECT id, photo_id, embedding, bbox FROM face_embeddings WHERE event_id = ? AND label = ? ORDER BY photo_id, face_index",
    [eventId, "facenet"]
  );

  if (rows.length === 0) {
    return NextResponse.json({
      error: "No FaceNet embeddings in database. Please run reindex first.",
      matchCount: 0,
      results: [],
      _debug: { storedEmbeddings: 0, label: "facenet" },
    });
  }

  const scored = rows.map((r) => {
    const embedding = JSON.parse(r.embedding as string) as number[];
    const bbox = r.bbox ? JSON.parse(r.bbox as string) as { x: number; y: number; width: number; height: number } : undefined;
    return {
      photoId: r.photo_id as string,
      faceId: r.id as string,
      similarity: Number(dotSimilarity(queryEmbedding!, embedding).toFixed(4)),
      bbox,
    };
  })
    .filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  const results = dedupeByPhoto(scored, limit);

  return NextResponse.json({
    provider: "facenet",
    threshold,
    matchCount: results.length,
    results,
    _debug: {
      storedEmbeddings: rows.length,
      queryDim: queryEmbedding.length,
      aboveThreshold: scored.length,
      uniquePhotos: results.length,
    },
  });
}

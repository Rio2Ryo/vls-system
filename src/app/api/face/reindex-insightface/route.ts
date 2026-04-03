import { NextRequest, NextResponse } from "next/server";
import { d1Query, d1Get } from "@/lib/d1";
import { r2Get, isR2Configured } from "@/lib/r2";

// Alias for mutation queries (d1Query works for both reads and writes)
const d1Execute = d1Query;

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes

const INSIGHTFACE_API_URL = process.env.INSIGHTFACE_API_URL || "http://localhost:7860";

/** Fetch image bytes: try R2 directly for /api/media/... paths, else HTTP fetch */
async function fetchImageBuffer(imageUrl: string): Promise<ArrayBuffer> {
  // /api/media/photos/evt-summer/filename.jpg → R2 key: photos/evt-summer/filename.jpg
  const mediaMatch = imageUrl.match(/\/api\/media\/(.+)$/);
  if (mediaMatch && isR2Configured()) {
    const r2Key = mediaMatch[1];
    const r2Result = await r2Get(r2Key);
    if (!r2Result) throw new Error(`R2: Not found: ${r2Key}`);
    return r2Result.body;
  }
  // Fallback: HTTP fetch
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  return res.arrayBuffer();
}

async function getEmbeddingFromUrl(imageUrl: string): Promise<{ embedding: number[]; bbox: number[] } | null> {
  const imgBuffer = await fetchImageBuffer(imageUrl);

  // Send to InsightFace API
  const formData = new FormData();
  formData.append("file", new Blob([imgBuffer], { type: "image/jpeg" }), "photo.jpg");

  const embedRes = await fetch(`${INSIGHTFACE_API_URL}/embed`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(30000),
  });

  if (!embedRes.ok) throw new Error(`InsightFace API error: ${embedRes.status}`);

  const data = await embedRes.json() as {
    faces: Array<{ embedding: number[]; bbox: number[]; det_score: number }>;
    count: number;
  };

  if (data.count === 0) return null;

  // Return face with highest detection score
  const best = data.faces.reduce((a, b) => (b.det_score > a.det_score ? b : a));
  return { embedding: best.embedding, bbox: best.bbox };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = body.eventId as string | undefined;
  let photos = body.photos as Array<{ photoId: string; url: string }> | undefined;
  const deleteFirst = body.deleteFirst as boolean | undefined;

  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  // Determine base URL for resolving relative photo URLs
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";

  // If photos not provided, load from D1 kv_store
  if (!Array.isArray(photos) || photos.length === 0) {
    const eventsJson = await d1Get("vls_admin_events").catch(() => null);
    if (!eventsJson) {
      return NextResponse.json({ error: "Could not load events from D1 (vls_admin_events not found)" }, { status: 404 });
    }
    const events = JSON.parse(eventsJson) as Array<{ id: string; photos?: Array<{ id: string; originalUrl?: string; thumbnailUrl?: string; url?: string }> }>;
    const event = events.find((e) => e.id === eventId);
    if (!event) {
      return NextResponse.json({ error: `Event "${eventId}" not found in D1` }, { status: 404 });
    }
    photos = (event.photos || []).map((p) => {
      let url = p.originalUrl || p.thumbnailUrl || p.url || "";
      // Convert relative URLs to absolute
      if (url && url.startsWith("/") && baseUrl) {
        url = `${baseUrl}${url}`;
      }
      return { photoId: p.id, url };
    }).filter((p) => p.url);
    if (photos.length === 0) {
      return NextResponse.json({ error: "No photos with URLs found in this event" }, { status: 400 });
    }
  }

  // Check InsightFace API health
  try {
    const health = await fetch(`${INSIGHTFACE_API_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok) throw new Error("InsightFace API not healthy");
  } catch {
    return NextResponse.json({
      error: `InsightFace API unavailable at ${INSIGHTFACE_API_URL}. Please check the server.`,
    }, { status: 503 });
  }

  // Delete existing InsightFace embeddings for this event if requested
  if (deleteFirst) {
    await d1Execute(
      "DELETE FROM face_embeddings WHERE event_id = ? AND label = ?",
      [eventId, "insightface-poc"]
    );
  }

  const results: Array<{ photoId: string; faces: number; error?: string }> = [];
  let indexedPhotos = 0;
  let indexedFaces = 0;

  for (const photo of photos) {
    try {
      const result = await getEmbeddingFromUrl(photo.url);
      if (!result) {
        results.push({ photoId: photo.photoId, faces: 0 });
        continue;
      }

      const { embedding, bbox } = result;
      const faceId = `${photo.photoId}_if_0`;

      await d1Execute(
        `INSERT OR REPLACE INTO face_embeddings
         (id, event_id, photo_id, face_index, embedding, bbox, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          faceId,
          eventId,
          photo.photoId,
          0,
          JSON.stringify(embedding),
          JSON.stringify({
            x: Math.round(bbox[0]),
            y: Math.round(bbox[1]),
            width: Math.round(bbox[2] - bbox[0]),
            height: Math.round(bbox[3] - bbox[1]),
          }),
          "insightface-poc",
          Date.now(),
        ]
      );

      indexedPhotos++;
      indexedFaces++;
      results.push({ photoId: photo.photoId, faces: 1 });
    } catch (e) {
      results.push({ photoId: photo.photoId, faces: 0, error: String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    indexedPhotos,
    indexedFaces,
    results,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { d1Query, d1Get } from "@/lib/d1";
import { r2Get, isR2Configured } from "@/lib/r2";

// Alias for mutation queries (d1Query works for both reads and writes)
const d1Execute = d1Query;

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes

const FACENET_API_URL = process.env.FACENET_API_URL || process.env.INSIGHTFACE_API_URL || "http://localhost:5000";

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

async function getAllFacesFromUrl(imageUrl: string): Promise<Array<{ embedding: number[]; bbox: number[]; det_score: number }>> {
  const imgBuffer = await fetchImageBuffer(imageUrl);

  // Send to FaceNet API
  const formData = new FormData();
  formData.append("file", new Blob([imgBuffer], { type: "image/jpeg" }), "photo.jpg");

  const embedRes = await fetch(`${FACENET_API_URL}/embed`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(30000),
  });

  if (!embedRes.ok) throw new Error(`FaceNet API error: ${embedRes.status}`);

  const data = await embedRes.json() as {
    faces: Array<{ embedding: number[]; bbox: number[]; det_score: number }>;
    count: number;
  };

  // Return faces with det_score >= 0.7 and minimum bbox size (filters false positives like walls)
  return data.faces.filter(f => {
    if (f.det_score < 0.7) return false;
    const w = f.bbox[2] - f.bbox[0];
    const h = f.bbox[3] - f.bbox[1];
    if (w < 30 || h < 30) return false; // too small = likely false positive
    return true;
  });
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
  const vercelUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const baseUrl = vercelUrl;
  console.log("[reindex] baseUrl:", baseUrl, "eventId:", eventId, "R2 configured:", isR2Configured());

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

  // Check FaceNet API health
  try {
    const health = await fetch(`${FACENET_API_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok) throw new Error("FaceNet API not healthy");
  } catch {
    return NextResponse.json({
      error: `FaceNet API unavailable at ${FACENET_API_URL}. Please check the server.`,
    }, { status: 503 });
  }

  // Delete existing FaceNet embeddings for this event if requested
  if (deleteFirst) {
    await d1Execute(
      "DELETE FROM face_embeddings WHERE event_id = ? AND label = ?",
      [eventId, "facenet"]
    );
  }

  const results: Array<{ photoId: string; faces: number; error?: string }> = [];
  let indexedPhotos = 0;
  let indexedFaces = 0;

  for (const photo of photos) {
    try {
      const faces = await getAllFacesFromUrl(photo.url);
      if (faces.length === 0) {
        console.log(`[reindex] No face detected for ${photo.photoId} (url: ${photo.url.slice(0, 80)})`);
        results.push({ photoId: photo.photoId, faces: 0 });
        continue;
      }

      // Store ALL detected faces (matching standalone app behavior)
      for (let fi = 0; fi < faces.length; fi++) {
        const face = faces[fi];
        const faceId = `${photo.photoId}_if_${fi}`;

        await d1Execute(
          `INSERT OR REPLACE INTO face_embeddings
           (id, event_id, photo_id, face_index, embedding, bbox, label, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            faceId,
            eventId,
            photo.photoId,
            fi,
            JSON.stringify(face.embedding),
            JSON.stringify({
              x: Math.round(face.bbox[0]),
              y: Math.round(face.bbox[1]),
              width: Math.round(face.bbox[2] - face.bbox[0]),
              height: Math.round(face.bbox[3] - face.bbox[1]),
            }),
            "facenet",
            Date.now(),
          ]
        );
        indexedFaces++;
      }

      indexedPhotos++;
      results.push({ photoId: photo.photoId, faces: faces.length });
    } catch (e) {
      console.error(`[reindex] Error processing ${photo.photoId}:`, e);
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

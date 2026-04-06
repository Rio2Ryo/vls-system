import { NextRequest, NextResponse } from "next/server";
import { d1Query, d1Get } from "@/lib/d1";

const d1Execute = d1Query;

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Import pre-computed face embeddings from standalone app (face_db.pkl export).
 * This guarantees identical search results between standalone and VLS.
 * 
 * POST body: {
 *   eventId: string,
 *   entries: Array<{
 *     clean_name: string,        // filename like "1773752174078-gym_118.jpg"
 *     face_index: number,
 *     embedding: number[],       // 512-dim L2-normalized
 *     bbox: number[],            // [x1, y1, x2, y2]
 *     det_score: number
 *   }>
 * }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = body.eventId as string;
  const entries = body.entries as Array<{
    clean_name: string;
    face_index: number;
    embedding: number[];
    bbox: number[];
    det_score: number;
  }>;
  const deleteFirst = body.deleteFirst as boolean | undefined;

  if (!eventId || !entries || !Array.isArray(entries)) {
    return NextResponse.json({ error: "eventId and entries[] required" }, { status: 400 });
  }

  // Load event photos to map clean_name → photoId
  const eventsJson = await d1Get("vls_admin_events").catch(() => null);
  if (!eventsJson) {
    return NextResponse.json({ error: "Could not load events" }, { status: 404 });
  }

  const events = JSON.parse(eventsJson) as Array<{
    id: string;
    photos?: Array<{ id: string; originalUrl?: string; thumbnailUrl?: string; url?: string }>;
  }>;
  const event = events.find((e) => e.id === eventId);
  if (!event) {
    return NextResponse.json({ error: `Event "${eventId}" not found` }, { status: 404 });
  }

  // Build filename → photoId mapping
  // VLS photo URL: /api/media/photos/evt-summer/1773752174078-gym_118.jpg
  // Extract filename from URL
  const photoMap = new Map<string, string>();
  for (const p of (event.photos || [])) {
    const url = p.originalUrl || p.thumbnailUrl || p.url || "";
    const filename = url.split("/").pop() || "";
    if (filename) {
      photoMap.set(filename, p.id);
    }
    // Also try without extension
    const noExt = filename.replace(/\.[^.]+$/, "");
    if (noExt) {
      photoMap.set(noExt, p.id);
    }
  }

  console.log(`[import] Event ${eventId}: ${photoMap.size} photos mapped, ${entries.length} entries to import`);

  // Delete existing if requested
  if (deleteFirst) {
    await d1Execute(
      "DELETE FROM face_embeddings WHERE event_id = ? AND label = ?",
      [eventId, "facenet"]
    );
    console.log("[import] Deleted existing facenet embeddings");
  }

  let imported = 0;
  let skipped = 0;
  const unmapped: string[] = [];

  for (const entry of entries) {
    // Try to find photoId from clean_name
    let photoId = photoMap.get(entry.clean_name);
    if (!photoId) {
      // Try without .jpg extension
      const noExt = entry.clean_name.replace(/\.[^.]+$/, "");
      photoId = photoMap.get(noExt);
    }
    if (!photoId) {
      // Try matching by timestamp portion
      const tsMatch = entry.clean_name.match(/^(\d+)/);
      if (tsMatch) {
        for (const [fn, pid] of photoMap.entries()) {
          if (fn.includes(tsMatch[1])) {
            photoId = pid;
            break;
          }
        }
      }
    }

    if (!photoId) {
      if (!unmapped.includes(entry.clean_name)) {
        unmapped.push(entry.clean_name);
      }
      skipped++;
      continue;
    }

    const faceId = `${photoId}_if_${entry.face_index}`;
    const bbox = entry.bbox; // [x1, y1, x2, y2]

    await d1Execute(
      `INSERT OR REPLACE INTO face_embeddings
       (id, event_id, photo_id, face_index, embedding, bbox, label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        faceId,
        eventId,
        photoId,
        entry.face_index,
        JSON.stringify(entry.embedding),
        JSON.stringify({
          x: Math.round(bbox[0]),
          y: Math.round(bbox[1]),
          width: Math.round(bbox[2] - bbox[0]),
          height: Math.round(bbox[3] - bbox[1]),
        }),
        "facenet",
        Date.now(),
      ]
    );
    imported++;
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    unmappedSample: unmapped.slice(0, 10),
    totalPhotosInEvent: photoMap.size / 2, // divided by 2 since we add with and without extension
  });
}

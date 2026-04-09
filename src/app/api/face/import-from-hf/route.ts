import { NextRequest, NextResponse } from "next/server";
import { d1Query, d1Get } from "@/lib/d1";

const d1Execute = d1Query;

export const runtime = "nodejs";
export const maxDuration = 300;

const FACENET_API_URL = process.env.FACENET_API_URL || "https://ryosukematsuura-face-test-0409.hf.space";
const HF_TOKEN = process.env.HF_TOKEN || "";

interface HFFace {
  image_name: string;
  face_index: number;
  bbox: number[];
  embedding: number[];
  det_score: number;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = body.eventId as string;
  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  // 1. Load event photos from D1 to build filename → photoId mapping
  const eventsJson = await d1Get("vls_admin_events").catch(() => null);
  if (!eventsJson) {
    return NextResponse.json({ error: "Could not load events from D1" }, { status: 404 });
  }

  const events = JSON.parse(eventsJson) as Array<{
    id: string;
    photos?: Array<{ id: string; originalUrl?: string; thumbnailUrl?: string; url?: string }>;
  }>;
  const event = events.find((e) => e.id === eventId);
  if (!event) {
    return NextResponse.json({ error: `Event "${eventId}" not found` }, { status: 404 });
  }

  // Build filename → photoId map
  const filenameToPhotoId = new Map<string, string>();
  for (const p of event.photos || []) {
    const url = p.originalUrl || p.thumbnailUrl || p.url || "";
    const filename = url.split("/").pop() || "";
    if (filename) {
      filenameToPhotoId.set(filename, p.id);
    }
  }

  console.log(`[import-from-hf] Event: ${eventId}, photos mapped: ${filenameToPhotoId.size}`);

  // 2. Fetch face database from HF Space
  let exportData: { total: number; faces: HFFace[] };
  try {
    const exportRes = await fetch(`${FACENET_API_URL}/export-db`, {
      headers: {
        ...(HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(120000),
    });

    if (!exportRes.ok) {
      return NextResponse.json(
        { error: `HF Space /export-db failed: ${exportRes.status}` },
        { status: 502 }
      );
    }

    exportData = (await exportRes.json()) as { total: number; faces: HFFace[] };
    console.log(`[import-from-hf] HF export: ${exportData.total} faces`);
  } catch (e) {
    return NextResponse.json(
      { error: `HF Space connection failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  // 3. Delete existing facenet embeddings for this event
  await d1Execute(
    "DELETE FROM face_embeddings WHERE event_id = ? AND label = ?",
    [eventId, "facenet"]
  );
  console.log(`[import-from-hf] Deleted existing embeddings for ${eventId}`);

  // 4. Import each face — match image_name to photoId
  let imported = 0;
  let skipped = 0;
  const unmatchedFiles = new Set<string>();

  for (const face of exportData.faces) {
    const photoId = filenameToPhotoId.get(face.image_name);
    if (!photoId) {
      unmatchedFiles.add(face.image_name);
      skipped++;
      continue;
    }

    const faceId = `${photoId}_if_${face.face_index}`;
    const bbox = {
      x: Math.round(face.bbox[0]),
      y: Math.round(face.bbox[1]),
      width: Math.round(face.bbox[2] - face.bbox[0]),
      height: Math.round(face.bbox[3] - face.bbox[1]),
    };

    try {
      await d1Execute(
        `INSERT OR REPLACE INTO face_embeddings
         (id, event_id, photo_id, face_index, embedding, bbox, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          faceId,
          eventId,
          photoId,
          face.face_index,
          JSON.stringify(face.embedding),
          JSON.stringify(bbox),
          "facenet",
          Date.now(),
        ]
      );
      imported++;
    } catch (e) {
      console.error(`[import-from-hf] Insert error for ${face.image_name}#${face.face_index}:`, e);
    }

    // Log progress every 500 faces
    if (imported % 500 === 0 && imported > 0) {
      console.log(`[import-from-hf] Progress: ${imported} imported, ${skipped} skipped`);
    }
  }

  console.log(`[import-from-hf] Done: ${imported} imported, ${skipped} skipped`);

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    totalFromHF: exportData.total,
    mappedPhotos: filenameToPhotoId.size,
    unmatchedFiles: Array.from(unmatchedFiles).slice(0, 10),
    unmatchedCount: unmatchedFiles.size,
    debug: {
      vlsFilenames: Array.from(filenameToPhotoId.keys()).slice(0, 10),
      hfFilenames: [...new Set(exportData.faces.map(f => f.image_name))].slice(0, 10),
    },
  });
}

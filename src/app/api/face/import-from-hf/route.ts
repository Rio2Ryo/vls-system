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

interface ExportPage {
  total: number;
  offset: number;
  limit: number;
  count: number;
  hasMore: boolean;
  faces: HFFace[];
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

  // 1. Load event photos from D1 to build suffix → photoId mapping
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

  // Build suffix → photoId map
  // VLS: "1773571007297-gym_001.jpg" → "gym_001.jpg"
  // HF:  "imgi_100_1773752174078-gym_118.jpg" → "gym_118.jpg"
  const suffixToPhotoId = new Map<string, string>();
  for (const p of event.photos || []) {
    const url = p.originalUrl || p.thumbnailUrl || p.url || "";
    const filename = url.split("/").pop() || "";
    const hyphenIdx = filename.lastIndexOf("-");
    const suffix = hyphenIdx >= 0 ? filename.slice(hyphenIdx + 1) : filename;
    if (suffix) {
      suffixToPhotoId.set(suffix, p.id);
    }
  }

  console.log(`[import-from-hf] Event: ${eventId}, photos mapped: ${suffixToPhotoId.size}`);

  // 2. Delete existing facenet embeddings for this event
  await d1Execute(
    "DELETE FROM face_embeddings WHERE event_id = ? AND label = ?",
    [eventId, "facenet"]
  );
  console.log(`[import-from-hf] Deleted existing embeddings for ${eventId}`);

  // 3. Fetch face database from HF Space in pages of 200
  const PAGE_SIZE = 200;
  let offset = 0;
  let totalFromHF = 0;
  let imported = 0;
  let skipped = 0;
  const unmatchedFiles = new Set<string>();

  while (true) {
    let page: ExportPage;
    try {
      const exportRes = await fetch(
        `${FACENET_API_URL}/export-db?offset=${offset}&limit=${PAGE_SIZE}`,
        {
          headers: {
            ...(HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {}),
          },
          signal: AbortSignal.timeout(60000),
        }
      );

      if (!exportRes.ok) {
        return NextResponse.json(
          { error: `HF /export-db failed: ${exportRes.status} at offset ${offset}` },
          { status: 502 }
        );
      }

      page = (await exportRes.json()) as ExportPage;
      totalFromHF = page.total;
    } catch (e) {
      return NextResponse.json(
        { error: `HF connection failed at offset ${offset}: ${e instanceof Error ? e.message : String(e)}` },
        { status: 502 }
      );
    }

    console.log(`[import-from-hf] Page offset=${offset}, got ${page.count} faces`);

    // 4. Import each face in this page
    for (const face of page.faces) {
      const hfHyphenIdx = face.image_name.lastIndexOf("-");
      const hfSuffix = hfHyphenIdx >= 0 ? face.image_name.slice(hfHyphenIdx + 1) : face.image_name;
      const photoId = suffixToPhotoId.get(hfSuffix);

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
    }

    console.log(`[import-from-hf] Progress: ${imported} imported, ${skipped} skipped`);

    if (!page.hasMore) break;
    offset += PAGE_SIZE;
  }

  console.log(`[import-from-hf] Done: ${imported} imported, ${skipped} skipped`);

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    totalFromHF,
    mappedPhotos: suffixToPhotoId.size,
    unmatchedFiles: Array.from(unmatchedFiles).slice(0, 10),
    unmatchedCount: unmatchedFiles.size,
  });
}

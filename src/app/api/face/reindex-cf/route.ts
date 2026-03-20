import { NextRequest, NextResponse } from "next/server";
import {
  isD1Configured,
  deleteFaceEmbeddingsByEvent,
  insertFaceEmbedding,
  getFaceEmbeddingsByPhoto,
} from "@/lib/d1";
import { generateImageEmbedding, isCfAiConfigured } from "@/lib/cf-ai";

/**
 * POST /api/face/reindex-cf
 *
 * Server-side face reindex using Cloudflare Workers AI (ResNet-50).
 * Fetches photos, generates embeddings via CF AI, stores in D1.
 *
 * Body: { eventId: string, photos: Array<{ photoId: string, url: string }>, deleteFirst?: boolean }
 * Returns: { ok, indexed, deleted, total, results: Array<{ photoId, faces, error? }> }
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = body.eventId as string | undefined;
  const photos = body.photos as Array<{ photoId: string; url: string }> | undefined;
  const deleteFirst = (body.deleteFirst as boolean | undefined) ?? true;

  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    return NextResponse.json({ error: "photos array required" }, { status: 400 });
  }
  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }
  if (!isCfAiConfigured()) {
    return NextResponse.json({ error: "CF_ACCOUNT_ID and CF_API_TOKEN not configured" }, { status: 503 });
  }

  let deleted = 0;
  if (deleteFirst) {
    deleted = await deleteFaceEmbeddingsByEvent(eventId);
  }

  let indexed = 0;
  const results: Array<{ photoId: string; faces: number; error?: string; skipped?: boolean }> = [];

  for (const photo of photos) {
    // Skip already-indexed photos when not deleting first
    if (!deleteFirst) {
      const existing = await getFaceEmbeddingsByPhoto(photo.photoId);
      if (existing.length > 0) {
        results.push({ photoId: photo.photoId, faces: existing.length, skipped: true });
        indexed += existing.length;
        continue;
      }
    }

    try {
      // Fetch the photo as base64
      const imgRes = await fetch(photo.url);
      if (!imgRes.ok) {
        results.push({ photoId: photo.photoId, faces: 0, error: `HTTP ${imgRes.status} fetching image` });
        continue;
      }
      const buffer = await imgRes.arrayBuffer();
      const imgBuffer = Buffer.from(buffer);

      // Generate embedding via CF Workers AI CLIP (pass Buffer directly)
      const embedding = await generateImageEmbedding(imgBuffer);

      if (!embedding || embedding.length === 0) {
        results.push({ photoId: photo.photoId, faces: 0, error: "Empty embedding returned" });
        continue;
      }

      await insertFaceEmbedding({
        id: `${photo.photoId}_cf0`,
        eventId,
        photoId: photo.photoId,
        faceIndex: 0,
        embedding,
        bbox: undefined,
      });

      indexed++;
      results.push({ photoId: photo.photoId, faces: 1 });
    } catch (err) {
      console.error(`[reindex-cf] Failed to process photo ${photo.photoId}:`, err);
      results.push({ photoId: photo.photoId, faces: 0, error: String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    indexed,
    deleted,
    total: photos.length,
    results,
  });
}

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { isD1Configured, deleteFaceEmbeddingsByEvent, insertFaceEmbedding, getFaceEmbeddingsByPhoto } from "@/lib/d1";

/**
 * POST /api/face/reindex-server
 *
 * Server-side face reindex using @vladmandic/face-api + canvas (Node.js).
 * Fetches photos, detects faces, generates 128-dim embeddings, stores in D1.
 *
 * Body: { eventId: string, photos: Array<{ photoId: string, url: string }>, deleteFirst?: boolean }
 * Returns: { ok, indexed, results: Array<{ photoId, faces, error? }> }
 */

// Lazily loaded to avoid SSR issues
let faceApiLoaded = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faceapi: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let canvasLib: any = null;

async function loadServerFaceApi() {
  if (faceApiLoaded) return;

  // Load canvas (Node.js native canvas implementation)
  // canvas is an optional dependency; ignore missing type declarations
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  canvasLib = await import(/* webpackIgnore: true */ "canvas");
  const { Canvas, Image, ImageData } = canvasLib;

  // Import @vladmandic/face-api
  // webpackIgnore: loaded at runtime only, not bundled
  faceapi = await import(/* webpackIgnore: true */ "@vladmandic/face-api");

  // Monkey-patch the environment for Node.js
  faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

  // Load models from public/models directory
  const modelsPath = path.join(process.cwd(), "public", "models");
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);

  faceApiLoaded = true;
}

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for large events

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

  try {
    await loadServerFaceApi();
  } catch (err) {
    console.error("[reindex-server] Failed to load face-api:", err);
    return NextResponse.json(
      { error: "Failed to load face detection models: " + String(err) },
      { status: 500 }
    );
  }

  // Optionally delete existing embeddings before reindexing
  let deleted = 0;
  if (deleteFirst) {
    deleted = await deleteFaceEmbeddingsByEvent(eventId);
  }

  let indexed = 0;
  const results: Array<{ photoId: string; faces: number; error?: string; skipped?: boolean }> = [];

  for (const photo of photos) {
    // Skip if already indexed and deleteFirst is false
    if (!deleteFirst) {
      const existing = await getFaceEmbeddingsByPhoto(photo.photoId);
      if (existing.length > 0) {
        results.push({ photoId: photo.photoId, faces: existing.length, skipped: true });
        indexed += existing.length;
        continue;
      }
    }

    try {
      // Load image via canvas
      const img = await canvasLib.loadImage(photo.url);

      // Detect faces with landmarks and descriptors
      const detections = await faceapi
        .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      let faceCount = 0;
      for (let i = 0; i < detections.length; i++) {
        const d = detections[i];
        const embedding = Array.from(d.descriptor) as number[];

        // Validate embedding
        if (embedding.length !== 128 || embedding.some((v) => !isFinite(v))) {
          continue;
        }

        await insertFaceEmbedding({
          id: `${photo.photoId}_face${i}`,
          eventId,
          photoId: photo.photoId,
          faceIndex: i,
          embedding,
          bbox: {
            x: Math.round(d.detection.box.x),
            y: Math.round(d.detection.box.y),
            width: Math.round(d.detection.box.width),
            height: Math.round(d.detection.box.height),
          },
        });
        faceCount++;
        indexed++;
      }

      results.push({ photoId: photo.photoId, faces: faceCount });
    } catch (err) {
      console.error(`[reindex-server] Failed to process photo ${photo.photoId}:`, err);
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

import { NextRequest, NextResponse } from "next/server";
import {
  isD1Configured,
  getFaceEmbeddingsByEvent,
  insertFaceSearchSession,
  d1Get,
} from "@/lib/d1";
import { cosineSimilarity, type FaceBox, type FaceSearchResult } from "@/lib/face";
import { generateImageEmbedding, isCfAiConfigured } from "@/lib/cf-ai";

/**
 * POST /api/face/search
 *
 * Gemini-first face search: all event photos are sent to Gemini Vision in batches.
 * CLIP is used only for ordering (not filtering) so no true matches are dropped.
 *
 * Body (two modes):
 *   Mode A — CF Workers AI (preferred):
 *     imageBase64: string     — base64 encoded image (with or without data URL prefix)
 *     eventId:     string
 *     threshold?:  number     — unused for Gemini path; kept for CLIP-only fallback
 *     limit?:      number     — max results (default 50, max 200)
 *     userId?:     string
 *
 *   Mode B — direct embedding (legacy / fallback):
 *     queryEmbedding: number[]
 *     eventId:        string
 *     threshold?:     number
 *     limit?:         number
 *     userId?:        string
 *
 * Returns:
 *   { sessionId, matchCount, uniquePhotos, results: FaceSearchResult[] }
 *   or on CF AI failure: { error, fallbackRequired: true }
 */

export const maxDuration = 120;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_BATCH_SIZE = 20;   // photos per Gemini call
const GEMINI_CONCURRENCY = 5;   // parallel Gemini calls

interface PhotoRecord {
  id: string;
  originalUrl?: string;
  thumbnailUrl?: string;
}

interface EventRecord {
  id: string;
  photos?: PhotoRecord[];
}

async function fetchPhotoBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return {
      base64: Buffer.from(buf).toString("base64"),
      mimeType: res.headers.get("content-type") || "image/jpeg",
    };
  } catch {
    return null;
  }
}

async function runGeminiVisionBatch(
  queryBase64: string,
  queryMimeType: string,
  candidates: { photoId: string; base64: string; mimeType: string; index: number }[]
): Promise<string[]> {
  const parts: Record<string, unknown>[] = [
    {
      text: "以下の【検索用写真】に写っている人物と同一人物が写っている写真を【候補写真】から探してください。",
    },
    { text: "【検索用写真（この人物を探しています）】" },
    { inlineData: { mimeType: queryMimeType, data: queryBase64 } },
    {
      text: `【候補写真 ${candidates.length}枚（インデックス0〜${candidates.length - 1}）】`,
    },
  ];

  for (const c of candidates) {
    parts.push({ text: `写真インデックス ${c.index}:` });
    parts.push({ inlineData: { mimeType: c.mimeType, data: c.base64 } });
  }

  parts.push({
    text:
      "上記候補写真のうち、検索用写真と同一人物が写っているものの インデックス番号をJSONで返してください。" +
      "顔の特徴（目・鼻・口・輪郭など）で判断し、子供の場合は笑顔・走っている・俯いているなど異なる表情・姿勢でも同一人物を特定してください。" +
      "確信が低い場合も含めてください。必ずこの形式のJSONのみを返してください: {\"matches\": [0, 2, 5]}" +
      "一致なしの場合: {\"matches\": []}",
  });

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`[face/search] Gemini batch error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const indices: number[] = Array.isArray(parsed.matches) ? parsed.matches : [];
    return indices
      .map((i) => candidates.find((c) => c.index === i)?.photoId)
      .filter((id): id is string => !!id);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const imageBase64 = body.imageBase64 as string | undefined;
  const rawEmbedding = body.queryEmbedding as number[] | undefined;
  const eventId = body.eventId as string | undefined;
  const rawThreshold = Number(body.threshold) || 0.4;
  const threshold = Math.max(0.0, Math.min(1.0, rawThreshold));
  const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
  const userId = (body.userId as string) || undefined;

  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json({ error: "eventId (string) required" }, { status: 400 });
  }
  if (!imageBase64 && (!rawEmbedding || !Array.isArray(rawEmbedding) || rawEmbedding.length === 0)) {
    return NextResponse.json(
      { error: "imageBase64 or queryEmbedding required" },
      { status: 400 },
    );
  }
  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  // Resolve embedding: prefer CF AI from imageBase64, fall back to direct queryEmbedding
  let queryEmbedding: number[];
  if (imageBase64) {
    if (!isCfAiConfigured()) {
      return NextResponse.json(
        { error: "CF Workers AI not configured", fallbackRequired: true },
        { status: 503 },
      );
    }
    try {
      queryEmbedding = await generateImageEmbedding(imageBase64);
    } catch (err) {
      console.error("[face/search] CF AI embedding failed:", err);
      return NextResponse.json(
        { error: `CF Workers AI failed: ${String(err)}`, fallbackRequired: true },
        { status: 502 },
      );
    }
  } else {
    queryEmbedding = rawEmbedding!;
  }

  // Fetch all event embeddings from D1
  const rows = await getFaceEmbeddingsByEvent(eventId);
  if (rows.length === 0) {
    return NextResponse.json({
      sessionId: null,
      matchCount: 0,
      uniquePhotos: 0,
      results: [],
    });
  }

  // CLIP scoring — used for ordering only (not filtering), deduplicate by photoId
  const seenPhotoIds = new Set<string>();
  const scoredPhotos: Array<{ photoId: string; similarity: number; row: (typeof rows)[0] }> = [];
  for (const row of rows) {
    const photoId = row.photo_id as string;
    if (seenPhotoIds.has(photoId)) continue;
    seenPhotoIds.add(photoId);
    const stored = JSON.parse(row.embedding as string) as number[];
    const similarity = cosineSimilarity(queryEmbedding, stored);
    scoredPhotos.push({ photoId, similarity, row });
  }
  // Sort by CLIP score descending (best guesses first, but we check ALL)
  scoredPhotos.sort((a, b) => b.similarity - a.similarity);

  // Gemini Vision path: batch all photos
  if (imageBase64 && GEMINI_API_KEY) {
    try {
      const eventsJson = await d1Get("vls_admin_events").catch(() => null);
      if (eventsJson) {
        const events = JSON.parse(eventsJson) as EventRecord[];
        const event = events.find((e) => e.id === eventId);
        if (event?.photos) {
          // Build photoId → URL map
          const photoUrlMap = new Map<string, string>();
          for (const p of event.photos) {
            const url = p.originalUrl || p.thumbnailUrl;
            if (url) photoUrlMap.set(p.id, url);
          }

          // Fetch all candidate photos in parallel
          const fetchResults = await Promise.all(
            scoredPhotos.map(async ({ photoId }) => {
              const url = photoUrlMap.get(photoId);
              if (!url) return null;
              const img = await fetchPhotoBase64(url);
              if (!img) return null;
              return { photoId, base64: img.base64, mimeType: img.mimeType };
            })
          );
          const validPhotos = fetchResults.filter(
            (r): r is { photoId: string; base64: string; mimeType: string } => r !== null
          );

          if (validPhotos.length > 0) {
            // Parse query image
            let queryBase64: string;
            let queryMimeType: string;
            if (imageBase64.startsWith("data:")) {
              const sep = imageBase64.indexOf(";base64,");
              queryBase64 = sep >= 0 ? imageBase64.slice(sep + 8) : imageBase64;
              queryMimeType = sep >= 0 ? imageBase64.slice(5, sep) : "image/jpeg";
            } else {
              queryBase64 = imageBase64;
              queryMimeType = "image/jpeg";
            }

            // Split into batches
            const batches: { photoId: string; base64: string; mimeType: string; index: number }[][] = [];
            for (let i = 0; i < validPhotos.length; i += GEMINI_BATCH_SIZE) {
              const slice = validPhotos.slice(i, i + GEMINI_BATCH_SIZE);
              batches.push(slice.map((p, j) => ({ ...p, index: j })));
            }

            // Run batches with concurrency limit
            const allMatchedIds: string[] = [];
            for (let i = 0; i < batches.length; i += GEMINI_CONCURRENCY) {
              const chunk = batches.slice(i, i + GEMINI_CONCURRENCY);
              const chunkResults = await Promise.all(
                chunk.map((batch) => runGeminiVisionBatch(queryBase64, queryMimeType, batch))
              );
              for (const ids of chunkResults) allMatchedIds.push(...ids);
            }

            if (allMatchedIds.length > 0) {
              const matchedSet = new Set(allMatchedIds);
              const geminiResults: FaceSearchResult[] = scoredPhotos
                .filter((c) => matchedSet.has(c.photoId))
                .map((c) => ({
                  photoId: c.photoId,
                  faceId: c.row.id as string,
                  similarity: Math.round(c.similarity * 10000) / 10000,
                  bbox: c.row.bbox
                    ? (JSON.parse(c.row.bbox as string) as FaceBox)
                    : undefined,
                }))
                .slice(0, limit);

              const uniquePhotos = new Set(geminiResults.map((r) => r.photoId)).size;
              const sessionId = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              try {
                await insertFaceSearchSession({
                  id: sessionId,
                  userId,
                  eventId,
                  queryEmbedding,
                  results: geminiResults,
                  threshold,
                });
              } catch {
                console.error("[face/search] Failed to save search session");
              }

              return NextResponse.json({
                sessionId,
                matchCount: geminiResults.length,
                uniquePhotos,
                results: geminiResults,
              });
            }

            // Gemini found no matches in any batch — return empty
            return NextResponse.json({
              sessionId: null,
              matchCount: 0,
              uniquePhotos: 0,
              results: [],
            });
          }
        }
      }
    } catch (err) {
      console.error("[face/search] Gemini Vision batched search failed, falling back to CLIP:", err);
    }
  }

  // CLIP-only fallback (no Gemini key or Gemini path failed)
  const clipResults: FaceSearchResult[] = scoredPhotos
    .filter((c) => c.similarity >= threshold)
    .map((c) => ({
      photoId: c.photoId,
      faceId: c.row.id as string,
      similarity: Math.round(c.similarity * 10000) / 10000,
      bbox: c.row.bbox ? (JSON.parse(c.row.bbox as string) as FaceBox) : undefined,
    }))
    .slice(0, limit);

  const uniquePhotos = new Set(clipResults.map((r) => r.photoId)).size;
  const sessionId = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await insertFaceSearchSession({
      id: sessionId,
      userId,
      eventId,
      queryEmbedding,
      results: clipResults,
      threshold,
    });
  } catch {
    console.error("[face/search] Failed to save search session");
  }

  return NextResponse.json({
    sessionId,
    matchCount: clipResults.length,
    uniquePhotos,
    results: clipResults,
  });
}

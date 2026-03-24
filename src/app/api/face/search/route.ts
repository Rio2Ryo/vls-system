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
 * Unified face search endpoint:
 *   1. CLIP embedding scoring for ordering candidates
 *   2. Gemini Vision batch verification for accurate matching
 *   3. CLIP-only fallback when Gemini is unavailable
 *
 * Body:
 *   imageBase64:    string     — base64 encoded image (with or without data URL prefix)
 *   eventId:        string
 *   threshold?:     number     — cosine similarity threshold for CLIP fallback (default 0.4)
 *   limit?:         number     — max results (default 50, max 200)
 *   userId?:        string
 *   queryEmbedding? number[]   — legacy: direct face-api.js embedding (CLIP fallback only)
 *
 * Returns:
 *   { sessionId, matchCount, uniquePhotos, results: FaceSearchResult[], searchMethod }
 */

export const maxDuration = 120;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_BATCH_SIZE = 20;
const GEMINI_CONCURRENCY = 5;
const GEMINI_TIMEOUT_MS = 30000;
const PHOTO_FETCH_TIMEOUT_MS = 10000;

interface PhotoRecord {
  id: string;
  originalUrl?: string;
  thumbnailUrl?: string;
}

interface EventRecord {
  id: string;
  photos?: PhotoRecord[];
}

function log(level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), route: "face/search", level, msg, ...meta };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

async function fetchPhotoBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      log("warn", "Photo fetch failed", { url: url.slice(0, 80), status: res.status });
      return null;
    }
    const buf = await res.arrayBuffer();
    return {
      base64: Buffer.from(buf).toString("base64"),
      mimeType: res.headers.get("content-type") || "image/jpeg",
    };
  } catch (err) {
    log("warn", "Photo fetch error", { url: url.slice(0, 80), error: String(err) });
    return null;
  }
}

function parseQueryImage(imageBase64: string): { base64: string; mimeType: string } {
  if (imageBase64.startsWith("data:")) {
    const sep = imageBase64.indexOf(";base64,");
    return {
      base64: sep >= 0 ? imageBase64.slice(sep + 8) : imageBase64,
      mimeType: sep >= 0 ? imageBase64.slice(5, sep) : "image/jpeg",
    };
  }
  return { base64: imageBase64, mimeType: "image/jpeg" };
}

async function runGeminiVisionBatch(
  queryBase64: string,
  queryMimeType: string,
  candidates: { photoId: string; base64: string; mimeType: string; index: number }[]
): Promise<{ matchedIds: string[]; error?: string }> {
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
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const error = `Gemini ${res.status}: ${errBody.slice(0, 200)}`;
      log("error", "Gemini batch error", { status: res.status, body: errBody.slice(0, 200) });
      return { matchedIds: [], error };
    }

    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      log("warn", "Gemini returned non-JSON response", { text: text.slice(0, 200) });
      return { matchedIds: [], error: "Non-JSON response from Gemini" };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const indices: number[] = Array.isArray(parsed.matches) ? parsed.matches : [];
    const matchedIds = indices
      .map((i) => candidates.find((c) => c.index === i)?.photoId)
      .filter((id): id is string => !!id);

    return { matchedIds };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log("error", "Gemini batch exception", { error });
    return { matchedIds: [], error };
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
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

  // Resolve CLIP embedding from image
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
      log("error", "CF AI embedding failed", { error: String(err) });
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
    log("info", "No embeddings found for event", { eventId });
    return NextResponse.json({
      sessionId: null,
      matchCount: 0,
      uniquePhotos: 0,
      results: [],
      searchMethod: "none",
      timing: { totalMs: Date.now() - startTime },
    });
  }

  // CLIP scoring — deduplicate by photoId, sort by similarity descending
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
  scoredPhotos.sort((a, b) => b.similarity - a.similarity);

  log("info", "CLIP scoring complete", {
    eventId,
    totalPhotos: scoredPhotos.length,
    topScore: scoredPhotos[0]?.similarity,
  });

  // Gemini Vision path: verify all photos using vision model
  if (imageBase64 && GEMINI_API_KEY) {
    try {
      const eventsJson = await d1Get("vls_admin_events").catch(() => null);
      if (!eventsJson) {
        log("warn", "Could not fetch event data for Gemini path, falling back to CLIP");
      } else {
        const events = JSON.parse(eventsJson) as EventRecord[];
        const event = events.find((e) => e.id === eventId);
        if (!event?.photos) {
          log("warn", "Event has no photos array, falling back to CLIP", { eventId });
        } else {
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

          log("info", "Photo fetch complete", {
            requested: scoredPhotos.length,
            fetched: validPhotos.length,
          });

          if (validPhotos.length > 0) {
            const { base64: queryBase64, mimeType: queryMimeType } = parseQueryImage(imageBase64);

            // Split into batches
            const batches: { photoId: string; base64: string; mimeType: string; index: number }[][] = [];
            for (let i = 0; i < validPhotos.length; i += GEMINI_BATCH_SIZE) {
              const slice = validPhotos.slice(i, i + GEMINI_BATCH_SIZE);
              batches.push(slice.map((p, j) => ({ ...p, index: j })));
            }

            // Run batches with concurrency limit
            const allMatchedIds: string[] = [];
            let geminiErrors = 0;
            for (let i = 0; i < batches.length; i += GEMINI_CONCURRENCY) {
              const chunk = batches.slice(i, i + GEMINI_CONCURRENCY);
              const chunkResults = await Promise.all(
                chunk.map((batch) => runGeminiVisionBatch(queryBase64, queryMimeType, batch))
              );
              for (const result of chunkResults) {
                allMatchedIds.push(...result.matchedIds);
                if (result.error) geminiErrors++;
              }
            }

            log("info", "Gemini Vision search complete", {
              batches: batches.length,
              errors: geminiErrors,
              matches: allMatchedIds.length,
              totalMs: Date.now() - startTime,
            });

            // If all batches errored, fall through to CLIP fallback
            if (geminiErrors === batches.length && batches.length > 0) {
              log("warn", "All Gemini batches failed, falling back to CLIP");
            } else {
              // Build results — if Gemini found matches, use them; otherwise return empty
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
              } catch (err) {
                log("error", "Failed to save search session", { error: String(err) });
              }

              return NextResponse.json({
                sessionId,
                matchCount: geminiResults.length,
                uniquePhotos,
                results: geminiResults,
                searchMethod: "gemini-vision",
                timing: { totalMs: Date.now() - startTime },
              });
            }
          }
        }
      }
    } catch (err) {
      log("error", "Gemini Vision search failed, falling back to CLIP", { error: String(err) });
    }
  }

  // CLIP-only fallback (no Gemini key, Gemini path failed, or legacy queryEmbedding mode)
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
  } catch (err) {
    log("error", "Failed to save search session", { error: String(err) });
  }

  log("info", "CLIP fallback search complete", {
    matches: clipResults.length,
    threshold,
    totalMs: Date.now() - startTime,
  });

  return NextResponse.json({
    sessionId,
    matchCount: clipResults.length,
    uniquePhotos,
    results: clipResults,
    searchMethod: "clip-cosine",
    timing: { totalMs: Date.now() - startTime },
  });
}

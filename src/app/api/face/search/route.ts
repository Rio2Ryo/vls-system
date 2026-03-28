import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
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

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const CLAUDE_BATCH_SIZE = 10;   // photos per Claude call (images are large, keep batches smaller)
const CLAUDE_CONCURRENCY = 3;   // parallel Claude calls

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

async function runClaudeVisionBatch(
  queryBase64: string,
  queryMimeType: string,
  candidates: { photoId: string; base64: string; mimeType: string; index: number }[]
): Promise<string[]> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const validMimeType = (m: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" =>
    ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(m)
      ? (m as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
      : "image/jpeg";

  const content: Anthropic.MessageParam["content"] = [
    {
      type: "text",
      text:
        "あなたは高精度な顔認識AIです。【検索用写真】の人物と【候補写真】を厳密に照合してください。\n\n" +
        "【判定基準（すべて満たす場合のみ一致とする）】\n" +
        "1. 性別が一致している\n" +
        "2. 年齢層が近い（±3歳以内）\n" +
        "3. 顔の輪郭・骨格・顔の形が一致している\n" +
        "4. 目の形・間隔・眉の形・まぶたの特徴が一致している\n" +
        "5. 鼻の形・大きさ・口の形・唇の厚さが一致している\n\n" +
        "【重要】\n" +
        "・少しでも疑わしい場合は一致にしないでください\n" +
        "・似ているだけでは不十分です。同一人物と高い確信がある場合のみ一致とする\n" +
        "・子どもの場合、同年代の別人と混同しないよう特に慎重に判断してください\n" +
        "・角度・照明・表情が違っても顔の構造的特徴で判断してください\n\n" +
        "【検索用写真（この人物を探しています）】",
    },
    {
      type: "image",
      source: { type: "base64", media_type: validMimeType(queryMimeType), data: queryBase64 },
    },
    {
      type: "text",
      text: `【候補写真 ${candidates.length}枚（インデックス0〜${candidates.length - 1}）】`,
    },
  ];

  for (const c of candidates) {
    content.push({ type: "text", text: `写真インデックス ${c.index}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: validMimeType(c.mimeType), data: c.base64 },
    });
  }

  content.push({
    type: "text",
    text:
      "上記の判定基準に従って、検索用写真の人物と明確に同一人物であると確信できる候補写真のインデックス番号のみをJSONで返してください。" +
      "確信が持てない写真は含めないでください。" +
      '必ずこの形式のJSONのみを返してください: {"matches": [0, 2, 5]}' +
      '一致なしの場合: {"matches": []}',
  });

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const indices: number[] = Array.isArray(parsed.matches) ? parsed.matches : [];
    return indices
      .map((i) => candidates.find((c) => c.index === i)?.photoId)
      .filter((id): id is string => !!id);
  } catch (err) {
    console.error("[face/search] Claude Vision batch error:", err);
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

  // Claude Vision path: batch all photos
  if (imageBase64 && ANTHROPIC_API_KEY) {
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
            for (let i = 0; i < validPhotos.length; i += CLAUDE_BATCH_SIZE) {
              const slice = validPhotos.slice(i, i + CLAUDE_BATCH_SIZE);
              batches.push(slice.map((p, j) => ({ ...p, index: j })));
            }

            // Run batches with concurrency limit
            const allMatchedIds: string[] = [];
            for (let i = 0; i < batches.length; i += CLAUDE_CONCURRENCY) {
              const chunk = batches.slice(i, i + CLAUDE_CONCURRENCY);
              const chunkResults = await Promise.all(
                chunk.map((batch) => runClaudeVisionBatch(queryBase64, queryMimeType, batch))
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
                  similarity: 1.0, // Gemini Vision confirmed match
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
      console.error("[face/search] Claude Vision batched search failed, falling back to CLIP:", err);
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

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  isD1Configured,
  insertFaceSearchSession,
  d1Get,
  getFaceEmbeddingsByEvent,
} from "@/lib/d1";
import { r2Get, isR2Configured } from "@/lib/r2";
import { type FaceSearchResult } from "@/lib/face";

/**
 * POST /api/face/search
 *
 * Claude Vision face search — 2 phases only (no Phase 3 to avoid timeout):
 *   Phase 1: Analyze query face → detailed text description
 *   Phase 2: Batch compare query photo + candidates via Claude Vision
 *
 * Body:
 *   imageBase64: string   — base64 encoded image (with or without data URL prefix)
 *   eventId:     string
 *   limit?:      number   — max results (default 50, max 200)
 *   userId?:     string
 *
 * Returns:
 *   { sessionId, matchCount, uniquePhotos, results: FaceSearchResult[] }
 */

export const maxDuration = 120;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const CLAUDE_BATCH_SIZE = 5;
const CLAUDE_CONCURRENCY = 5;

interface PhotoRecord {
  id: string;
  originalUrl?: string;
  thumbnailUrl?: string;
}

interface EventRecord {
  id: string;
  photos?: PhotoRecord[];
}

/** Detect actual image MIME type from binary magic bytes (ignores Content-Type header). */
function detectImageMimeType(buf: ArrayBuffer): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const bytes = new Uint8Array(buf, 0, 12);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return "image/jpeg";
}

/** Fetch a photo: handles R2 paths, data: URLs, and absolute HTTP URLs. */
async function fetchPhotoBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    if (url.startsWith("data:")) {
      const sep = url.indexOf(";base64,");
      if (sep < 0) return null;
      const mime = url.slice(5, sep) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      return { base64: url.slice(sep + 8), mimeType: mime };
    }
    const mediaPrefix = "/api/media/";
    if (url.startsWith(mediaPrefix) && isR2Configured()) {
      const key = url.slice(mediaPrefix.length);
      const obj = await r2Get(key).catch(() => null);
      if (!obj) return null;
      return { base64: Buffer.from(obj.body).toString("base64"), mimeType: detectImageMimeType(obj.body) };
    }
    if (url.startsWith("http")) {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return { base64: Buffer.from(buf).toString("base64"), mimeType: detectImageMimeType(buf) };
    }
    return null;
  } catch {
    return null;
  }
}

const validMimeType = (m: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" =>
  ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(m)
    ? (m as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
    : "image/jpeg";

/**
 * Phase 1: Analyze the query image and extract a detailed face description.
 */
async function analyzeQueryFace(base64: string, mimeType: string): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text:
              "この写真に写っている人物の外見的特徴を、別の写真で同じ人物を見つけるために詳しく記述してください。\n" +
              "以下を含めてください：\n" +
              "・性別、推定年齢\n" +
              "・顔の形\n" +
              "・目の特徴（大きさ、一重/二重）\n" +
              "・鼻・口の特徴\n" +
              "・眉毛の形\n" +
              "・髪型・髪色\n" +
              "・メガネの有無\n" +
              "・肌の色合い\n" +
              "・服装の色や特徴\n" +
              "日本語で簡潔に答えてください。",
          },
          {
            type: "image",
            source: { type: "base64", media_type: validMimeType(mimeType), data: base64 },
          },
        ],
      }],
    });
    return response.content[0]?.type === "text" ? response.content[0].text : "";
  } catch {
    return "";
  }
}

interface BatchMatch {
  photoId: string;
  confidence: number;
}

/**
 * Phase 2: Compare query photo against a batch of candidate photos.
 * Returns matches with confidence scores.
 */
async function runClaudeVisionBatch(
  queryBase64: string,
  queryMimeType: string,
  candidates: { photoId: string; base64: string; mimeType: string; index: number }[],
  faceDescription: string
): Promise<BatchMatch[]> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const descriptionBlock = faceDescription
    ? `\n【この人物の特徴】\n${faceDescription}\n`
    : "";

  const content: Anthropic.MessageParam["content"] = [
    {
      type: "text",
      text:
        "写真の中から特定の人物を探す作業を手伝ってください。\n" +
        "【写真A】に写っている人物と同じ人物が、候補写真の中にいるか確認してください。\n" +
        descriptionBlock +
        "\n【判定のポイント】\n" +
        "・顔の特徴（目・鼻・口・輪郭・眉）が一致するか見てください\n" +
        "・同じ人物が写っていれば、角度や表情が違っても一致です\n" +
        "・集合写真の中に対象の人物がいる場合も一致です\n" +
        "・別人の場合は不一致としてください\n\n" +
        "【写真A（この人物を探してください）】",
    },
    {
      type: "image",
      source: { type: "base64", media_type: validMimeType(queryMimeType), data: queryBase64 },
    },
    {
      type: "text",
      text: `\n以下の${candidates.length}枚の候補写真を確認してください：`,
    },
  ];

  for (const c of candidates) {
    content.push({ type: "text", text: `候補${c.index}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: validMimeType(c.mimeType), data: c.base64 },
    });
  }

  content.push({
    type: "text",
    text:
      "写真Aの人物と同じ人物が写っている候補写真があれば、そのインデックスと確信度を教えてください。\n" +
      "確信度は0〜100で、高いほど確実です。\n" +
      '回答はJSONのみで: {"matches": [{"index": 0, "confidence": 85}]}\n' +
      '一致なし: {"matches": []}',
  });

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    console.log(`[face/search] Batch response: ${text.slice(0, 200)}`);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const matches = Array.isArray(parsed.matches) ? parsed.matches : [];

    const mapped: (BatchMatch | null)[] = matches.map(
      (m: number | { index: number; confidence?: number }) => {
        const idx = typeof m === "number" ? m : m.index;
        const conf = typeof m === "number" ? 80 : (m.confidence ?? 80);
        // No server-side filtering — return all matches, let frontend filter by search mode
        const photoId = candidates.find((c) => c.index === idx)?.photoId;
        return photoId ? { photoId, confidence: conf } : null;
      }
    );
    return mapped.filter((m): m is BatchMatch => m !== null);
  } catch (err) {
    console.error("[face/search] Claude Vision batch error:", err);
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[face/search] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: String(err) },
      { status: 500 }
    );
  }
}

async function handlePost(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const imageBase64 = body.imageBase64 as string | undefined;
  const queryEmbeddingRaw = body.queryEmbedding as number[] | undefined;
  const eventId = body.eventId as string | undefined;
  const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
  const userId = (body.userId as string) || undefined;

  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json({ error: "eventId (string) required" }, { status: 400 });
  }
  if (!imageBase64 && !queryEmbeddingRaw) {
    return NextResponse.json({ error: "imageBase64 or queryEmbedding required" }, { status: 400 });
  }
  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }
  if (!imageBase64 && !ANTHROPIC_API_KEY) {
    // embedding-only path doesn't need Anthropic
  } else if (imageBase64 && !ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  // Parse query image (may be undefined when embedding-only path is used)
  let queryBase64: string = "";
  let queryMimeType: string = "image/jpeg";
  if (imageBase64) {
    if (imageBase64.startsWith("data:")) {
      const sep = imageBase64.indexOf(";base64,");
      queryBase64 = sep >= 0 ? imageBase64.slice(sep + 8) : imageBase64;
      queryMimeType = sep >= 0 ? imageBase64.slice(5, sep) : "image/jpeg";
    } else {
      queryBase64 = imageBase64;
      queryMimeType = "image/jpeg";
    }
  }

  // ── Embedding path (fast, feature-based) ──────────────────────────────
  // If queryEmbedding is provided, compare against D1 stored embeddings first.
  // This is much faster and more accurate than Claude Vision.
  if (queryEmbeddingRaw && Array.isArray(queryEmbeddingRaw) && queryEmbeddingRaw.length > 0) {
    console.log(`[face/search] Embedding path: query dim=${queryEmbeddingRaw.length}`);
    const storedEmbeddings = await getFaceEmbeddingsByEvent(eventId).catch(() => []);
    console.log(`[face/search] Stored embeddings: ${storedEmbeddings.length}`);

    if (storedEmbeddings.length > 0) {
      // Compute cosine similarity for each stored face
      const EMBED_THRESHOLD = 0.45;
      const photoScores = new Map<string, number>();
      for (const row of storedEmbeddings) {
        const emb = row.embedding as number[];
        const rowPhotoId = row.photo_id as string;
        if (!emb || emb.length === 0) continue;
        const sim = cosineSimilarity(queryEmbeddingRaw, emb);
        const existing = photoScores.get(rowPhotoId) ?? 0;
        if (sim > existing) photoScores.set(rowPhotoId, sim);
      }

      const embResults: FaceSearchResult[] = Array.from(photoScores.entries())
        .filter(([, sim]) => sim >= EMBED_THRESHOLD)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([photoId, sim]) => ({ photoId, faceId: photoId, similarity: sim }));

      console.log(`[face/search] Embedding results: ${embResults.length} above threshold ${EMBED_THRESHOLD}`);

      const sessionId = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        await insertFaceSearchSession({
          id: sessionId,
          userId,
          eventId,
          queryEmbedding: queryEmbeddingRaw,
          results: embResults,
          threshold: EMBED_THRESHOLD,
        });
      } catch {
        // non-fatal
      }

      return NextResponse.json({
        sessionId,
        matchCount: embResults.length,
        uniquePhotos: new Set(embResults.map((r) => r.photoId)).size,
        results: embResults,
        _debug: { mode: "embedding", storedEmbeddings: storedEmbeddings.length },
      });
    }

    console.log(`[face/search] No stored embeddings, falling back to Claude Vision`);
    // Fall through to Claude Vision if no embeddings in D1
  }

  // ── Claude Vision path (fallback when no D1 embeddings) ───────────────
  if (!imageBase64) {
    return NextResponse.json({ error: "imageBase64 required for Claude Vision search" }, { status: 400 });
  }
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  // Load all event photos from D1
  console.log(`[face/search] Loading event ${eventId} from D1`);
  const eventsJson = await d1Get("vls_admin_events").catch(() => null);
  if (!eventsJson) {
    console.error("[face/search] Event data not found in D1");
    return NextResponse.json({ error: "Event data not found" }, { status: 404 });
  }

  const events = JSON.parse(eventsJson) as EventRecord[];
  const event = events.find((e) => e.id === eventId);
  console.log(`[face/search] Event found: ${!!event}, photos: ${event?.photos?.length ?? 0}`);
  if (!event?.photos || event.photos.length === 0) {
    return NextResponse.json({ sessionId: null, matchCount: 0, uniquePhotos: 0, results: [] });
  }

  // Cap photos to avoid timeout
  const MAX_PHOTOS = 100;
  const shuffled = [...event.photos].sort(() => Math.random() - 0.5);
  const photosToProcess = shuffled.slice(0, MAX_PHOTOS);
  console.log(`[face/search] Processing ${photosToProcess.length}/${event.photos.length} photos`);

  // Run Phase 1 (face analysis) and photo fetching in parallel
  const FETCH_CONCURRENCY = 20;
  const [faceDescription, fetchResults] = await Promise.all([
    analyzeQueryFace(queryBase64, queryMimeType).then((desc) => {
      console.log(`[face/search] Phase 1 face description (${desc.length} chars): ${desc.slice(0, 100)}...`);
      return desc;
    }),
    (async () => {
      const results: ({ photoId: string; base64: string; mimeType: string } | null)[] = [];
      for (let i = 0; i < photosToProcess.length; i += FETCH_CONCURRENCY) {
        const slice = photosToProcess.slice(i, i + FETCH_CONCURRENCY);
        const batch = await Promise.all(
          slice.map(async (p) => {
            for (const url of [p.originalUrl, p.thumbnailUrl]) {
              if (!url) continue;
              const img = await fetchPhotoBase64(url);
              if (img) return { photoId: p.id, base64: img.base64, mimeType: img.mimeType };
            }
            return null;
          })
        );
        results.push(...batch);
      }
      return results;
    })(),
  ]);

  const validPhotos = fetchResults.filter(
    (r): r is { photoId: string; base64: string; mimeType: string } => r !== null
  );
  console.log(`[face/search] Fetched ${validPhotos.length}/${photosToProcess.length} photos`);

  if (validPhotos.length === 0) {
    return NextResponse.json({ sessionId: null, matchCount: 0, uniquePhotos: 0, results: [] });
  }

  // Phase 2: Batch matching (no Phase 3 — directly use results)
  const batches: { photoId: string; base64: string; mimeType: string; index: number }[][] = [];
  for (let i = 0; i < validPhotos.length; i += CLAUDE_BATCH_SIZE) {
    const slice = validPhotos.slice(i, i + CLAUDE_BATCH_SIZE);
    batches.push(slice.map((p, j) => ({ ...p, index: j })));
  }
  console.log(`[face/search] Phase 2: ${batches.length} batches (batch_size=${CLAUDE_BATCH_SIZE}, concurrency=${CLAUDE_CONCURRENCY})`);

  const allBatchMatches: BatchMatch[] = [];
  for (let i = 0; i < batches.length; i += CLAUDE_CONCURRENCY) {
    const chunk = batches.slice(i, i + CLAUDE_CONCURRENCY);
    const t0 = Date.now();
    const chunkResults = await Promise.all(
      chunk.map((batch) => runClaudeVisionBatch(queryBase64, queryMimeType, batch, faceDescription))
    );
    const matchesInChunk = chunkResults.reduce((sum, r) => sum + r.length, 0);
    console.log(`[face/search] Batch group ${Math.floor(i/CLAUDE_CONCURRENCY)+1}/${Math.ceil(batches.length/CLAUDE_CONCURRENCY)} done in ${Date.now()-t0}ms, matches: ${matchesInChunk}`);
    for (const matches of chunkResults) allBatchMatches.push(...matches);
  }

  // Deduplicate by photoId, keeping highest confidence
  const matchMap = new Map<string, BatchMatch>();
  for (const m of allBatchMatches) {
    const existing = matchMap.get(m.photoId);
    if (!existing || m.confidence > existing.confidence) {
      matchMap.set(m.photoId, m);
    }
  }
  const finalMatches = Array.from(matchMap.values())
    .sort((a, b) => b.confidence - a.confidence);
  console.log(`[face/search] Final: ${finalMatches.length} unique matches from ${allBatchMatches.length} total`);

  // Build results with confidence as similarity
  const results: FaceSearchResult[] = finalMatches
    .map((m) => ({
      photoId: m.photoId,
      faceId: m.photoId,
      similarity: Math.round(m.confidence) / 100,
    }))
    .slice(0, limit);

  const uniquePhotos = new Set(results.map((r) => r.photoId)).size;
  const sessionId = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await insertFaceSearchSession({
      id: sessionId,
      userId,
      eventId,
      queryEmbedding: [],
      results,
      threshold: 0.5,
    });
  } catch {
    console.error("[face/search] Failed to save search session");
  }

  return NextResponse.json({
    sessionId,
    matchCount: results.length,
    uniquePhotos,
    results,
    _debug: {
      totalPhotos: event.photos.length,
      fetchedPhotos: validPhotos.length,
      batchMatches: allBatchMatches.length,
      uniqueMatches: finalMatches.length,
    },
  });
}

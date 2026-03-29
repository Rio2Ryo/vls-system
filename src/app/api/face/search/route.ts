export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  isD1Configured,
  insertFaceSearchSession,
  d1Get,
} from "@/lib/d1";
import { r2Get, isR2Configured } from "@/lib/r2";
import { type FaceSearchResult } from "@/lib/face";

/**
 * POST /api/face/search
 *
 * Claude Vision-only face search: all event photos are sent to Claude in batches.
 * No CLIP / CF Workers AI dependency.
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

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const CLAUDE_BATCH_SIZE = 8;
const CLAUDE_CONCURRENCY = 3;

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
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // GIF: 47 49 46
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return "image/jpeg";
}

/** Fetch a photo: use R2 directly for /api/media/* paths, HTTP for external URLs. */
async function fetchPhotoBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    // /api/media/<key> → fetch directly from R2 to avoid auth issues
    const mediaPrefix = "/api/media/";
    if (url.startsWith(mediaPrefix) && isR2Configured()) {
      const key = url.slice(mediaPrefix.length);
      const obj = await r2Get(key).catch(() => null);
      if (!obj) return null;
      return { base64: Buffer.from(obj.body).toString("base64"), mimeType: detectImageMimeType(obj.body) };
    }
    // Absolute or other URLs: fetch via HTTP
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return {
      base64: Buffer.from(buf).toString("base64"),
      mimeType: detectImageMimeType(buf),
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
        "あなたは人物検索AIです。【検索用写真】の人物が【候補写真】に写っているかを、顔の特徴で厳密に判定してください。\n\n" +
        "【判定基準（厳格）】\n" +
        "・顔の輪郭・目・鼻・口の形が明確に一致する場合のみ一致とします\n" +
        "・小さすぎて顔が判別できない場合は不一致とします\n" +
        "・似ているが確信が持てない場合は不一致とします\n" +
        "・角度・照明・表情の違いは考慮してください\n" +
        "・服装・髪型は参考程度にしてください（同じイベントなら同じ服の可能性あり）\n\n" +
        "【対象写真の条件】\n" +
        "・集合写真・スポーツ写真でも、顔が判別できれば判定してください\n" +
        "・背景に写り込んでいる場合も含めます\n\n" +
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
      "上記の判定基準に従って判定してください。\n" +
      "顔の特徴が明確に一致すると確信できる写真のみ選んでください。似ているだけでは不十分です。\n" +
      "各候補写真の一致確信度（0〜100）も出力してください。\n" +
      '必ずこの形式のJSONのみを返してください: {"matches": [{"index": 0, "confidence": 95}, {"index": 2, "confidence": 80}]}\n' +
      '一致なしの場合: {"matches": []}',
  });

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const matches = Array.isArray(parsed.matches) ? parsed.matches : [];

    // Support both old format [0,2] and new format [{index:0,confidence:95}]
    return matches
      .map((m: number | { index: number; confidence?: number }) => {
        const idx = typeof m === "number" ? m : m.index;
        const conf = typeof m === "number" ? 100 : (m.confidence ?? 100);
        if (conf < 70) return null; // filter low-confidence matches
        return candidates.find((c) => c.index === idx)?.photoId ?? null;
      })
      .filter((id): id is string => id !== null);
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
  const eventId = body.eventId as string | undefined;
  const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
  const userId = (body.userId as string) || undefined;

  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json({ error: "eventId (string) required" }, { status: 400 });
  }
  if (!imageBase64) {
    return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
  }
  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

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

  // Fetch all event photos with limited concurrency (prefer thumbnail, fall back to original)
  console.log(`[face/search] Fetching ${event.photos.length} photos from R2`);
  const FETCH_CONCURRENCY = 20;
  const fetchResults: ({ photoId: string; base64: string; mimeType: string } | null)[] = [];
  for (let i = 0; i < event.photos.length; i += FETCH_CONCURRENCY) {
    const slice = event.photos.slice(i, i + FETCH_CONCURRENCY);
    const batch = await Promise.all(
      slice.map(async (p) => {
        // Try thumbnail first, then fall back to original
        for (const url of [p.thumbnailUrl, p.originalUrl]) {
          if (!url) continue;
          const img = await fetchPhotoBase64(url);
          if (img) return { photoId: p.id, base64: img.base64, mimeType: img.mimeType };
        }
        return null;
      })
    );
    fetchResults.push(...batch);
  }

  const validPhotos = fetchResults.filter(
    (r): r is { photoId: string; base64: string; mimeType: string } => r !== null
  );
  console.log(`[face/search] Fetched ${validPhotos.length}/${event.photos.length} photos successfully`);

  if (validPhotos.length === 0) {
    return NextResponse.json({ sessionId: null, matchCount: 0, uniquePhotos: 0, results: [] });
  }

  // Split into batches and run Claude Vision
  const batches: { photoId: string; base64: string; mimeType: string; index: number }[][] = [];
  for (let i = 0; i < validPhotos.length; i += CLAUDE_BATCH_SIZE) {
    const slice = validPhotos.slice(i, i + CLAUDE_BATCH_SIZE);
    batches.push(slice.map((p, j) => ({ ...p, index: j })));
  }
  console.log(`[face/search] Running ${batches.length} Claude Vision batches (concurrency=${CLAUDE_CONCURRENCY})`);

  const allMatchedIds: string[] = [];
  for (let i = 0; i < batches.length; i += CLAUDE_CONCURRENCY) {
    const chunk = batches.slice(i, i + CLAUDE_CONCURRENCY);
    const t0 = Date.now();
    const chunkResults = await Promise.all(
      chunk.map((batch) => runClaudeVisionBatch(queryBase64, queryMimeType, batch))
    );
    console.log(`[face/search] Batch group ${Math.floor(i/CLAUDE_CONCURRENCY)+1}/${Math.ceil(batches.length/CLAUDE_CONCURRENCY)} done in ${Date.now()-t0}ms`);
    for (const ids of chunkResults) allMatchedIds.push(...ids);
  }

  const matchedSet = new Set(allMatchedIds);
  const results: FaceSearchResult[] = validPhotos
    .filter((p) => matchedSet.has(p.photoId))
    .map((p) => ({ photoId: p.photoId, faceId: p.photoId, similarity: 1.0 }))
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
      threshold: 1.0,
    });
  } catch {
    console.error("[face/search] Failed to save search session");
  }

  return NextResponse.json({
    sessionId,
    matchCount: results.length,
    uniquePhotos,
    results,
    _debug: { totalPhotos: event.photos.length, fetchedPhotos: validPhotos.length },
  });
}

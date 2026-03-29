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

/** Fetch a photo: use R2 directly for /api/media/* paths, HTTP for external URLs. */
async function fetchPhotoBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    // /api/media/<key> → fetch directly from R2 to avoid auth issues
    const mediaPrefix = "/api/media/";
    if (url.startsWith(mediaPrefix) && isR2Configured()) {
      const key = url.slice(mediaPrefix.length);
      const obj = await r2Get(key).catch(() => null);
      if (!obj) return null;
      return { base64: Buffer.from(obj.body).toString("base64"), mimeType: obj.contentType };
    }
    // Absolute or other URLs: fetch via HTTP
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
        "あなたは人物検索AIです。【検索用写真】に写っている人物が、【候補写真】のどれかに写っているかを判定してください。\n\n" +
        "【判定方法】\n" +
        "候補写真の中に検索用写真の人物が写っていれば一致とします。\n" +
        "・人物が小さく写っていても構いません\n" +
        "・背景に写っていても構いません\n" +
        "・複数人が写っている集合写真でも判定してください\n" +
        "・角度・照明・表情の違いは無視してください\n" +
        "・服装・髪型が違っても顔の特徴で判断してください\n\n" +
        "【判定基準】\n" +
        "・同じ人物の可能性が50%以上あれば一致としてください\n" +
        "・明らかに別人（性別・年齢層が大きく異なる）の場合のみ除外してください\n" +
        "・判断が難しい場合は一致に含めてください（見逃しより誤検知を優先）\n\n" +
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

  // Fetch all event photos in parallel (prefer thumbnail for speed, use R2 directly)
  console.log(`[face/search] Fetching ${event.photos.length} photos from R2`);
  const fetchResults = await Promise.all(
    event.photos.map(async (p) => {
      const raw = p.thumbnailUrl || p.originalUrl;
      if (!raw) return null;
      const img = await fetchPhotoBase64(raw);
      if (!img) return null;
      return { photoId: p.id, base64: img.base64, mimeType: img.mimeType };
    })
  );

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

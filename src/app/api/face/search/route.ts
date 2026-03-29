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
const CLAUDE_BATCH_SIZE = 4;
const CLAUDE_CONCURRENCY = 4;
const VERIFY_CONCURRENCY = 4;

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

/** Fetch a photo: handles R2 paths, data: URLs, and absolute HTTP URLs. */
async function fetchPhotoBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    // data: URL — already base64, extract directly
    if (url.startsWith("data:")) {
      const sep = url.indexOf(";base64,");
      if (sep < 0) return null;
      const mime = url.slice(5, sep) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      return { base64: url.slice(sep + 8), mimeType: mime };
    }
    // /api/media/<key> → fetch directly from R2 to avoid auth issues
    const mediaPrefix = "/api/media/";
    if (url.startsWith(mediaPrefix) && isR2Configured()) {
      const key = url.slice(mediaPrefix.length);
      const obj = await r2Get(key).catch(() => null);
      if (!obj) return null;
      return { base64: Buffer.from(obj.body).toString("base64"), mimeType: detectImageMimeType(obj.body) };
    }
    // Absolute HTTP URL
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
 * This description is passed to each batch call to improve matching accuracy.
 */
async function analyzeQueryFace(base64: string, mimeType: string): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text:
              "この写真の人物の顔の特徴を、他の写真でその人を探すために使える情報として詳しく説明してください。\n" +
              "以下を必ず含めてください：\n" +
              "・顔の形（丸顔/面長/四角顔など）\n" +
              "・目の特徴（大きさ・形・一重/二重・目尻の向き）\n" +
              "・鼻の特徴（高さ・大きさ・形）\n" +
              "・口・唇の特徴\n" +
              "・肌の色合い・質感\n" +
              "・眉毛の形\n" +
              "・髪型・髪の色\n" +
              "・推定年齢層・性別\n" +
              "・その他の特徴（ほくろ・メガネ・特徴的な点）\n" +
              "日本語で具体的に答えてください。",
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

async function runClaudeVisionBatch(
  queryBase64: string,
  queryMimeType: string,
  candidates: { photoId: string; base64: string; mimeType: string; index: number }[],
  faceDescription: string
): Promise<BatchMatch[]> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const descriptionBlock = faceDescription
    ? `\n【検索対象の顔の特徴（AI分析済み）】\n${faceDescription}\n`
    : "";

  const content: Anthropic.MessageParam["content"] = [
    {
      type: "text",
      text:
        "あなたは顔認識の専門AIです。【検索用写真】の人物を、提供された特徴情報と照合して【候補写真】の中から探してください。\n" +
        descriptionBlock +
        "\n【厳格な判定基準 — 必ず全て守ること】\n" +
        "・目・鼻・口・顔の輪郭・眉の形など、複数の顔パーツの構造が一致することを確認\n" +
        "・「なんとなく似ている」「雰囲気が似ている」だけでは絶対に不一致とする\n" +
        "・服装・髪型・体型・ポーズが似ているだけでは不一致（顔の骨格的特徴のみで判断）\n" +
        "・同性・同年代というだけでは不一致（個人を特定できる顔の特徴が必要）\n" +
        "・顔が小さすぎる・ぼやけていて判別不可能な場合は不一致\n" +
        "・角度・照明・表情の違いは許容するが、顔の構造的特徴で判断\n" +
        "・確信度80%以上のみ一致と判定する。迷う場合は不一致とする\n\n" +
        "【検索用写真（この人物を探してください）】",
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
    content.push({ type: "text", text: `候補${c.index}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: validMimeType(c.mimeType), data: c.base64 },
    });
  }

  content.push({
    type: "text",
    text:
      "各候補写真を一つずつ確認し、検索用写真の人物と顔の構造が確実に一致するものだけを返してください。\n" +
      "確信度（0〜100）も必ず出力してください。迷う場合は不一致としてください。\n" +
      '形式: {"matches": [{"index": 0, "confidence": 92}]}\n' +
      '一致なし: {"matches": []}',
  });

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const matches = Array.isArray(parsed.matches) ? parsed.matches : [];

    const mapped: (BatchMatch | null)[] = matches.map(
      (m: number | { index: number; confidence?: number }) => {
        const idx = typeof m === "number" ? m : m.index;
        const conf = typeof m === "number" ? 100 : (m.confidence ?? 100);
        if (conf < 80) return null; // require 80% confidence (matches prompt instruction)
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

/**
 * Phase 3: Re-verify each candidate match 1-on-1 against the query photo.
 * This eliminates false positives from the batch phase.
 */
async function verifyMatch(
  queryBase64: string,
  queryMimeType: string,
  candidateBase64: string,
  candidateMimeType: string,
  faceDescription: string
): Promise<{ match: boolean; confidence: number }> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const descriptionBlock = faceDescription
    ? `\n【検索対象の顔の特徴（AI分析済み）】\n${faceDescription}\n`
    : "";

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text:
              "あなたは顔認識の専門AIです。以下の2枚の写真に同一人物が写っているか厳密に判定してください。\n" +
              descriptionBlock +
              "\n【判定時の注意 — 必ず全て守ること】\n" +
              "・目・鼻・口・顔の輪郭・眉毛の形状など、顔のパーツの構造的特徴で判断\n" +
              "・服装・髪型・体型・雰囲気が似ているだけでは不一致\n" +
              "・同性・同年代というだけでは不一致\n" +
              "・写真2に写っている人物が複数いる場合、検索対象と一致する人物が1人でもいればOK\n" +
              "・顔が不鮮明で判別できない場合は不一致\n" +
              "・迷う場合は不一致とする\n\n" +
              "【写真1: 検索対象の人物】",
          },
          {
            type: "image",
            source: { type: "base64", media_type: validMimeType(queryMimeType), data: queryBase64 },
          },
          {
            type: "text",
            text: "【写真2: 候補写真】",
          },
          {
            type: "image",
            source: { type: "base64", media_type: validMimeType(candidateMimeType), data: candidateBase64 },
          },
          {
            type: "text",
            text:
              '同一人物が写っていますか？JSONのみで回答してください。\n' +
              '形式: {"match": true, "confidence": 92, "reason": "目の形と鼻筋の特徴が一致"}\n' +
              '不一致: {"match": false, "confidence": 30, "reason": "顔の輪郭が異なる"}',
          },
        ],
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { match: false, confidence: 0 };

    const parsed = JSON.parse(jsonMatch[0]);
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const match = parsed.match === true && confidence >= 85;
    console.log(`[face/search] Verify: match=${match}, confidence=${confidence}, reason=${parsed.reason || "N/A"}`);
    return { match, confidence };
  } catch (err) {
    console.error("[face/search] Verify error:", err);
    return { match: false, confidence: 0 };
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

  // Cap photos to avoid timeout (120s limit): shuffle and take max 120
  const MAX_PHOTOS = 120;
  const shuffled = [...event.photos].sort(() => Math.random() - 0.5);
  const photosToProcess = shuffled.slice(0, MAX_PHOTOS);
  console.log(`[face/search] Processing ${photosToProcess.length}/${event.photos.length} photos`);

  // Run Phase 1 (face analysis) and R2 photo fetching in parallel to save time
  const FETCH_CONCURRENCY = 20;
  const [faceDescription, fetchResults] = await Promise.all([
    // Phase 1: Analyze query face
    analyzeQueryFace(queryBase64, queryMimeType).then((desc) => {
      console.log(`[face/search] Face description ready (${desc.length} chars)`);
      return desc;
    }),
    // Fetch photos from R2 with limited concurrency
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
  console.log(`[face/search] Fetched ${validPhotos.length}/${photosToProcess.length} photos successfully`);

  if (validPhotos.length === 0) {
    return NextResponse.json({ sessionId: null, matchCount: 0, uniquePhotos: 0, results: [] });
  }

  // Split into batches and run Claude Vision (Phase 2)
  const batches: { photoId: string; base64: string; mimeType: string; index: number }[][] = [];
  for (let i = 0; i < validPhotos.length; i += CLAUDE_BATCH_SIZE) {
    const slice = validPhotos.slice(i, i + CLAUDE_BATCH_SIZE);
    batches.push(slice.map((p, j) => ({ ...p, index: j })));
  }
  console.log(`[face/search] Phase 2: Running ${batches.length} Claude Vision batches (concurrency=${CLAUDE_CONCURRENCY})`);

  // Phase 2: Batch matching
  const allBatchMatches: BatchMatch[] = [];
  for (let i = 0; i < batches.length; i += CLAUDE_CONCURRENCY) {
    const chunk = batches.slice(i, i + CLAUDE_CONCURRENCY);
    const t0 = Date.now();
    const chunkResults = await Promise.all(
      chunk.map((batch) => runClaudeVisionBatch(queryBase64, queryMimeType, batch, faceDescription))
    );
    console.log(`[face/search] Batch group ${Math.floor(i/CLAUDE_CONCURRENCY)+1}/${Math.ceil(batches.length/CLAUDE_CONCURRENCY)} done in ${Date.now()-t0}ms`);
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
  const phase2Matches = Array.from(matchMap.values());
  console.log(`[face/search] Phase 2 complete: ${phase2Matches.length} candidates found`);

  // Phase 3: Verify each match 1-on-1 to eliminate false positives
  const verifiedResults: { photoId: string; confidence: number }[] = [];
  if (phase2Matches.length > 0) {
    console.log(`[face/search] Phase 3: Verifying ${phase2Matches.length} candidates`);
    for (let i = 0; i < phase2Matches.length; i += VERIFY_CONCURRENCY) {
      const chunk = phase2Matches.slice(i, i + VERIFY_CONCURRENCY);
      const verifications = await Promise.all(
        chunk.map(async (m) => {
          const photo = validPhotos.find((p) => p.photoId === m.photoId);
          if (!photo) return null;
          const result = await verifyMatch(
            queryBase64, queryMimeType,
            photo.base64, photo.mimeType,
            faceDescription
          );
          if (result.match) {
            return { photoId: m.photoId, confidence: result.confidence };
          }
          return null;
        })
      );
      for (const v of verifications) {
        if (v) verifiedResults.push(v);
      }
    }
    console.log(`[face/search] Phase 3 complete: ${verifiedResults.length}/${phase2Matches.length} verified`);
  }

  // Build final results with real confidence as similarity
  const results: FaceSearchResult[] = verifiedResults
    .sort((a, b) => b.confidence - a.confidence)
    .map((v) => ({
      photoId: v.photoId,
      faceId: v.photoId,
      similarity: Math.round(v.confidence) / 100,
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
      threshold: 0.85,
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
      phase2Candidates: phase2Matches.length,
      phase3Verified: verifiedResults.length,
    },
  });
}

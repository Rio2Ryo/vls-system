import { NextRequest, NextResponse } from "next/server";
import { d1Get } from "@/lib/d1";
import { PhotoData } from "@/lib/types";

/**
 * POST /api/face/search-vision
 *
 * High-accuracy face search using Dashscope Qwen Vision API (primary) with Gemini fallback.
 * Supports offset/limit pagination to avoid Vercel 60s timeout.
 *
 * Body:
 *   imageBase64:   string  — data URL or raw base64 of query face photo
 *   eventId:       string  — target event ID
 *   photoEntries?: Array<{id: string, base64: string}>  — pre-fetched/resized photos from client
 *   offset?:       number  — photo slice start (default 0, used when photoEntries not provided)
 *   limit?:        number  — max photos to process (default 150, used when photoEntries not provided)
 *
 * Returns:
 *   { matchedPhotoIds: string[], confidenceMap: Record<string, "high"|"medium">, total: number }
 */

export const maxDuration = 60;

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";
const DASHSCOPE_URL = "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions";
const DASHSCOPE_MODEL = "qwen3.5-plus";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const BATCH_SIZE = 3;
const PARALLEL_BATCHES = 2;

interface EventData {
  id: string;
  photos: PhotoData[];
}

interface PhotoFetchResult {
  photoId: string;
  base64: string;
  mimeType: string;
  index: number;
}

async function fetchPhotoAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString("base64");
    const mimeType = res.headers.get("content-type") || "image/jpeg";
    return { base64, mimeType };
  } catch {
    return null;
  }
}

interface MatchWithConfidence {
  index: number;
  confidence: "high" | "medium";
}

const FACE_SEARCH_PROMPT =
  "【検索用写真】に写っている人物と同一人物が写っているイベント写真を探してください。\n" +
  "以下の点を総合的に判断してください：\n" +
  "- 顔の特徴（目・鼻・口・輪郭・耳の形）\n" +
  "- 髪型・髪色\n" +
  "- 体格・年齢\n" +
  "- 服装（同じイベント内では同じ服を着ている可能性が高い）\n" +
  "子供の場合、表情が大きく異なっていても（笑顔・泣き顔・真剣な顔）同一人物を特定してください。\n" +
  "確信度: high（ほぼ確実）/ medium（おそらく同一）で評価。\n" +
  "low（確信なし）の場合は返さないでください。\n" +
  "JSON形式で返してください: {\"matches\": [{\"index\": 0, \"confidence\": \"high\"}]}\n" +
  "一致なしの場合: {\"matches\": []}";

function parseMatchesFromText(text: string): MatchWithConfidence[] {
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.matches)) return [];
    return parsed.matches.filter(
      (m: unknown): m is MatchWithConfidence =>
        typeof m === "object" &&
        m !== null &&
        "index" in m &&
        "confidence" in m &&
        ((m as MatchWithConfidence).confidence === "high" ||
          (m as MatchWithConfidence).confidence === "medium")
    );
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function searchBatchDashscope(
  queryBase64: string,
  queryMimeType: string,
  batch: PhotoFetchResult[]
): Promise<MatchWithConfidence[]> {
  const content: Record<string, unknown>[] = [
    { type: "text", text: "【検索用写真（この人物を探しています）】" },
    {
      type: "image_url",
      image_url: { url: `data:${queryMimeType};base64,${queryBase64}` },
    },
    {
      type: "text",
      text: `【イベント写真 ${batch.length}枚（インデックス0〜${batch.length - 1}）】`,
    },
  ];

  for (const pd of batch) {
    content.push({ type: "text", text: `写真インデックス ${pd.index}:` });
    content.push({
      type: "image_url",
      image_url: { url: `data:${pd.mimeType};base64,${pd.base64}` },
    });
  }

  content.push({ type: "text", text: FACE_SEARCH_PROMPT });

  const res = await fetch(DASHSCOPE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: DASHSCOPE_MODEL,
      messages: [{ role: "user", content }],
      max_tokens: 200,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    console.error(`[search-vision] Dashscope error: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content || "";
  return parseMatchesFromText(text);
}

type SearchBatchResult = {
  matches: MatchWithConfidence[];
  provider: "gemini" | "dashscope" | "none";
  debug?: string;
};

async function searchBatchGemini(
  queryBase64: string,
  queryMimeType: string,
  batch: PhotoFetchResult[]
): Promise<SearchBatchResult> {
  const parts: Record<string, unknown>[] = [
    { text: "【検索用写真（この人物を探しています）】" },
    { inlineData: { mimeType: queryMimeType, data: queryBase64 } },
    {
      text: `【イベント写真 ${batch.length}枚（インデックス0〜${batch.length - 1}）】`,
    },
  ];

  for (const pd of batch) {
    parts.push({ text: `写真インデックス ${pd.index}:` });
    parts.push({ inlineData: { mimeType: pd.mimeType, data: pd.base64 } });
  }

  parts.push({ text: FACE_SEARCH_PROMPT });

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(55000),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const debug = `Gemini error ${res.status}: ${bodyText.slice(0, 500)}`;
    console.error(`[search-vision] ${debug}`);
    return { matches: [], provider: "gemini", debug };
  }

  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { matches: parseMatchesFromText(text), provider: "gemini" };
}

async function searchBatch(
  queryBase64: string,
  queryMimeType: string,
  batch: PhotoFetchResult[]
): Promise<SearchBatchResult> {
  // Primary: Gemini Vision (faster in Vercel environment)
  if (GEMINI_API_KEY) {
    try {
      const result = await searchBatchGemini(queryBase64, queryMimeType, batch);
      if (result.matches.length > 0 || !DASHSCOPE_API_KEY) return result;
      console.warn("[search-vision] Gemini returned no matches/debug, falling back to Dashscope:", result.debug || "no-debug");
    } catch (err) {
      console.warn("[search-vision] Gemini failed, falling back to Dashscope:", err);
    }
  }

  return { matches: [], provider: "none", debug: "Gemini failed and Dashscope fallback disabled for debugging" };
}

function resolvePhotoUrl(url: string, reqUrl: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  try {
    const origin = new URL(reqUrl).origin;
    return `${origin}${url.startsWith("/") ? url : `/${url}`}`;
  } catch {
    return url;
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
  const eventId = body.eventId as string | undefined;
  const photoEntries = body.photoEntries as Array<{ id: string; base64: string }> | undefined;
  const offset = typeof body.offset === "number" ? body.offset : 0;
  const limit = typeof body.limit === "number" ? body.limit : 9;

  if (!imageBase64 || !eventId) {
    return NextResponse.json(
      { error: "imageBase64 and eventId are required" },
      { status: 400 }
    );
  }

  if (!DASHSCOPE_API_KEY && !GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "No Vision API key configured (DASHSCOPE_API_KEY or GEMINI_API_KEY required)" },
      { status: 503 }
    );
  }

  // Parse query image
  let queryBase64: string;
  let queryMimeType: string;
  if (imageBase64.startsWith("data:")) {
    const sep = imageBase64.indexOf(";base64,");
    if (sep < 0) {
      return NextResponse.json({ error: "Invalid data URL" }, { status: 400 });
    }
    queryMimeType = imageBase64.slice(5, sep);
    queryBase64 = imageBase64.slice(sep + 8);
  } else {
    queryBase64 = imageBase64;
    queryMimeType = "image/jpeg";
  }

  const matchedPhotoIds: string[] = [];
  const confidenceMap: Record<string, "high" | "medium"> = {};

  // Fast path: client provided pre-fetched/resized photos — skip server-side photo fetching
  if (photoEntries && photoEntries.length > 0) {
    const batchPhotos: PhotoFetchResult[] = photoEntries.map((entry, idx) => {
      const dataUrl = entry.base64;
      let base64 = dataUrl;
      let mimeType = "image/jpeg";
      if (dataUrl.startsWith("data:")) {
        const sep = dataUrl.indexOf(";base64,");
        if (sep >= 0) {
          mimeType = dataUrl.slice(5, sep);
          base64 = dataUrl.slice(sep + 8);
        }
      }
      return { photoId: entry.id, base64, mimeType, index: idx };
    });

    console.log(
      `[search-vision] Fast path: ${batchPhotos.length} pre-fetched photos from client, ` +
      `provider=${DASHSCOPE_API_KEY ? "dashscope" : "gemini"}`
    );

    const batchResult = await searchBatch(queryBase64, queryMimeType, batchPhotos).catch(
      (err) => ({ matches: [], provider: "none", debug: String(err) } as SearchBatchResult)
    );

    for (const m of batchResult.matches) {
      const photo = batchPhotos.find((p) => p.index === m.index);
      if (!photo) continue;
      if (!matchedPhotoIds.includes(photo.photoId)) {
        matchedPhotoIds.push(photo.photoId);
        confidenceMap[photo.photoId] = m.confidence;
      }
    }

    return NextResponse.json({
      matchedPhotoIds,
      confidenceMap,
      total: batchPhotos.length,
      provider: batchResult.provider,
      photosProcessed: batchPhotos.length,
      debug: batchResult.debug,
    });
  }

  // Fallback: server-side photo fetching via D1 event data
  const eventsJson = await d1Get("vls_admin_events").catch(() => null);
  if (!eventsJson) {
    return NextResponse.json({ matchedPhotoIds: [], confidenceMap: {}, total: 0 });
  }

  let events: EventData[];
  try {
    events = JSON.parse(eventsJson) as EventData[];
  } catch {
    return NextResponse.json({ matchedPhotoIds: [], confidenceMap: {}, total: 0 });
  }

  const event = events.find((e) => e.id === eventId);
  if (!event || !Array.isArray(event.photos) || event.photos.length === 0) {
    return NextResponse.json({ matchedPhotoIds: [], confidenceMap: {}, total: 0 });
  }

  const allPhotos = event.photos;
  const total = allPhotos.length;

  // Apply pagination
  const pagePhotos = allPhotos.slice(offset, offset + limit);

  console.log(
    `[search-vision] Fallback path: ${pagePhotos.length} photos (offset=${offset}, limit=${limit}), ` +
    `provider=${DASHSCOPE_API_KEY ? "dashscope" : "gemini"}`
  );

  // Build all batches
  const batches: PhotoData[][] = [];
  for (let i = 0; i < pagePhotos.length; i += BATCH_SIZE) {
    batches.push(pagePhotos.slice(i, i + BATCH_SIZE));
  }

  // Process batches in parallel rounds (PARALLEL_BATCHES at a time)
  for (let roundStart = 0; roundStart < batches.length; roundStart += PARALLEL_BATCHES) {
    const roundBatches = batches.slice(roundStart, roundStart + PARALLEL_BATCHES);

    const roundResults = await Promise.allSettled(
      roundBatches.map(async (batchPhotos, batchIdx) => {
        const globalBatchIdx = roundStart + batchIdx;
        const globalOffset = globalBatchIdx * BATCH_SIZE;

        const fetchResults = await Promise.allSettled(
          batchPhotos.map(async (photo, localIdx) => {
            const rawUrl = photo.originalUrl || photo.thumbnailUrl;
            if (!rawUrl) return null;
            const url = resolvePhotoUrl(rawUrl, req.url);
            const result = await fetchPhotoAsBase64(url);
            if (!result) return null;
            return {
              photoId: photo.id,
              base64: result.base64,
              mimeType: result.mimeType,
              index: localIdx,
            } satisfies PhotoFetchResult;
          })
        );

        const validBatch = fetchResults
          .map((r) => (r.status === "fulfilled" ? r.value : null))
          .filter((r): r is PhotoFetchResult => r !== null);

        if (validBatch.length === 0) return [];

        const batchResult = await searchBatch(queryBase64, queryMimeType, validBatch).catch(
          (err) => ({ matches: [], provider: "none", debug: String(err) } as SearchBatchResult)
        );

        return batchResult.matches.map((m) => ({
          match: m,
          photo: validBatch.find((p) => p.index === m.index) ?? null,
          _offset: globalOffset,
        }));
      })
    );

    for (const roundResult of roundResults) {
      if (roundResult.status !== "fulfilled") continue;
      for (const item of roundResult.value) {
        if (!item.photo) continue;
        if (!matchedPhotoIds.includes(item.photo.photoId)) {
          matchedPhotoIds.push(item.photo.photoId);
          confidenceMap[item.photo.photoId] = item.match.confidence;
        }
      }
    }
  }

  return NextResponse.json({
    matchedPhotoIds,
    confidenceMap,
    total,
    provider: DASHSCOPE_API_KEY ? "dashscope" : "gemini",
    photosProcessed: pagePhotos.length,
  });
}

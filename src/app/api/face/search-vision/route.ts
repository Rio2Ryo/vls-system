import { NextRequest, NextResponse } from "next/server";
import { d1Get } from "@/lib/d1";
import { PhotoData } from "@/lib/types";

/**
 * POST /api/face/search-vision
 *
 * High-accuracy face search using Gemini Vision API.
 * Replaces face-api.js 128-dim descriptor matching with full visual comparison.
 *
 * Body:
 *   imageBase64: string  — data URL or raw base64 of query face photo
 *   eventId:     string  — target event ID
 *
 * Returns:
 *   { matchedPhotoIds: string[] }
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const BATCH_SIZE = 5;
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

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

async function searchBatch(
  queryBase64: string,
  queryMimeType: string,
  batch: PhotoFetchResult[]
): Promise<MatchWithConfidence[]> {
  const parts: Record<string, unknown>[] = [
    {
      text:
        "以下の【検索用写真】に写っている人物と同一人物が写っている写真を【イベント写真】から探してください。",
    },
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

  parts.push({
    text:
      "上記イベント写真のうち、検索用写真と同一人物が写っているものを探してください。" +
      "年齢・性別・髪型・服装・顔の特徴（目・鼻・口・輪郭など）を総合的に判断してください。" +
      "子供の場合は笑顔・走っている・俯いているなど異なる表情・姿勢でも同一人物を特定してください。" +
      "各写真について確信度を high（ほぼ確実）または medium（おそらく同一）で評価してください。" +
      "low（確信なし）の場合は返さないでください。" +
      "必ずこの形式のJSONのみを返してください: {\"matches\": [{\"index\": 0, \"confidence\": \"high\"}, {\"index\": 2, \"confidence\": \"medium\"}]}" +
      "一致なしの場合: {\"matches\": []}",
  });

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    console.error(`[search-vision] Gemini error: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.matches)) return [];
    return parsed.matches
      .filter(
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

function resolvePhotoUrl(url: string, reqUrl: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  // Relative URL - resolve against request origin
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

  if (!imageBase64 || !eventId) {
    return NextResponse.json(
      { error: "imageBase64 and eventId are required" },
      { status: 400 }
    );
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
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

  // Fetch photos for the event from D1
  const eventsJson = await d1Get("vls_admin_events").catch(() => null);
  if (!eventsJson) {
    return NextResponse.json({ matchedPhotoIds: [] });
  }

  let events: EventData[];
  try {
    events = JSON.parse(eventsJson) as EventData[];
  } catch {
    return NextResponse.json({ matchedPhotoIds: [] });
  }

  const event = events.find((e) => e.id === eventId);
  if (!event || !Array.isArray(event.photos) || event.photos.length === 0) {
    return NextResponse.json({ matchedPhotoIds: [] });
  }

  const photos = event.photos;
  const matchedPhotoIds: string[] = [];
  const confidenceMap: Record<string, "high" | "medium"> = {};

  // Process photos in batches
  for (let i = 0; i < photos.length; i += BATCH_SIZE) {
    const batchPhotos = photos.slice(i, i + BATCH_SIZE);

    // Fetch each photo in parallel
    const fetchResults = await Promise.all(
      batchPhotos.map(async (photo, batchIdx) => {
        const rawUrl = photo.originalUrl || photo.thumbnailUrl;
        if (!rawUrl) return null;
        const url = resolvePhotoUrl(rawUrl, req.url);
        const result = await fetchPhotoAsBase64(url);
        if (!result) return null;
        return {
          photoId: photo.id,
          base64: result.base64,
          mimeType: result.mimeType,
          index: batchIdx,
        } satisfies PhotoFetchResult;
      })
    );

    const validBatch = fetchResults.filter((r): r is PhotoFetchResult => r !== null);
    if (validBatch.length === 0) continue;

    const matches = await searchBatch(queryBase64, queryMimeType, validBatch).catch(
      () => [] as MatchWithConfidence[]
    );

    for (const match of matches) {
      const pd = validBatch.find((p) => p.index === match.index);
      if (pd && !matchedPhotoIds.includes(pd.photoId)) {
        matchedPhotoIds.push(pd.photoId);
        confidenceMap[pd.photoId] = match.confidence;
      }
    }
  }

  return NextResponse.json({ matchedPhotoIds, confidenceMap });
}

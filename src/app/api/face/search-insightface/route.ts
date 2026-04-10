import { NextRequest, NextResponse } from "next/server";
import { d1Get } from "@/lib/d1";

export const runtime = "nodejs";
export const maxDuration = 60;

const FACENET_API_URL = process.env.FACENET_API_URL || "https://ryosukematsuura-face-test-0409.hf.space";
const HF_TOKEN = process.env.HF_TOKEN || "";

/**
 * VLS 顔検索 — 顔テスト②と完全同一方式
 * 画像をHF Spaceの /search に転送 → 結果のimage_nameをVLS photoIdにマッピング
 * D1のembeddingは使わない。全てHF Space (x86) 上で完結。
 */

function base64ToBuffer(b64: string): Buffer {
  const m = b64.match(/^data:[^;]+;base64,(.+)$/);
  return Buffer.from(m ? m[1] : b64, "base64");
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = body.eventId as string | undefined;
  const imageBase64 = body.imageBase64 as string | undefined;
  const imagesBase64 = body.imagesBase64 as string[] | undefined;
  const threshold = Number(body.threshold ?? 0.4);
  const limit = Number(body.limit ?? 200);

  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  // Collect images
  const images: string[] = [];
  if (imagesBase64 && imagesBase64.length > 0) {
    images.push(...imagesBase64.slice(0, 3));
  } else if (imageBase64) {
    images.push(imageBase64);
  }
  if (images.length === 0) {
    return NextResponse.json({ error: "imageBase64 or imagesBase64 required" }, { status: 400 });
  }

  // --- Build suffix → photoId map (for mapping HF results back to VLS photos) ---
  let suffixToPhotoId: Map<string, string> | null = null;
  try {
    const eventsJson = await d1Get("vls_admin_events");
    if (eventsJson) {
      const events = JSON.parse(eventsJson) as Array<{
        id: string;
        photos?: Array<{ id: string; originalUrl?: string; thumbnailUrl?: string; url?: string }>;
      }>;
      const event = events.find((e) => e.id === eventId);
      if (event?.photos) {
        suffixToPhotoId = new Map();
        for (const p of event.photos) {
          const url = p.originalUrl || p.thumbnailUrl || p.url || "";
          const fn = url.split("/").pop() || "";
          const hi = fn.lastIndexOf("-");
          const suffix = hi >= 0 ? fn.slice(hi + 1) : fn;
          if (suffix) suffixToPhotoId.set(suffix, p.id);
        }
      }
    }
  } catch (e) {
    console.error("[search] Failed to load events for mapping:", e);
  }

  // --- Forward to HF Space /search (same as 顔テスト②) ---
  try {
    const formData = new FormData();
    for (let i = 0; i < images.length; i++) {
      const buf = base64ToBuffer(images[i]);
      formData.append("images", new Blob([new Uint8Array(buf)], { type: "image/jpeg" }), `query_${i}.jpg`);
    }
    formData.append("threshold", String(threshold));
    formData.append("max_results", String(limit));

    const hfRes = await fetch(`${FACENET_API_URL}/search`, {
      method: "POST",
      headers: {
        ...(HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {}),
      },
      body: formData,
      signal: AbortSignal.timeout(45000),
    });

    if (!hfRes.ok) {
      const text = await hfRes.text();
      return NextResponse.json({
        error: `HF Space /search failed: ${hfRes.status} ${text.slice(0, 200)}`,
        matchCount: 0,
        results: [],
      });
    }

    const hfData = (await hfRes.json()) as {
      results: Array<{
        image_name: string;
        face_index: number;
        bbox: number[];
        similarity: number;
        det_score: number;
      }>;
      total_results: number;
      total_matched: number;
      query_faces: unknown[];
      threshold: number;
    };

    // --- Map image_name → VLS photoId ---
    const mapped = hfData.results.map((r) => {
      let photoId = r.image_name; // fallback
      if (suffixToPhotoId) {
        const hi = r.image_name.lastIndexOf("-");
        const suffix = hi >= 0 ? r.image_name.slice(hi + 1) : r.image_name;
        photoId = suffixToPhotoId.get(suffix) || r.image_name;
      }
      return {
        photoId,
        faceId: `${photoId}_if_${r.face_index}`,
        similarity: r.similarity,
        bbox: r.bbox
          ? { x: Math.round(r.bbox[0]), y: Math.round(r.bbox[1]), width: Math.round(r.bbox[2] - r.bbox[0]), height: Math.round(r.bbox[3] - r.bbox[1]) }
          : undefined,
      };
    });

    // Deduplicate by photoId (keep highest similarity)
    const seen = new Set<string>();
    const deduped = mapped.filter((r) => {
      if (seen.has(r.photoId)) return false;
      seen.add(r.photoId);
      return true;
    });

    return NextResponse.json({
      provider: "facenet",
      threshold,
      matchCount: deduped.length,
      results: deduped,
      _debug: {
        hfTotalMatched: hfData.total_matched,
        hfTotalResults: hfData.total_results,
        queryFaces: hfData.query_faces?.length ?? 0,
        mappedPhotos: suffixToPhotoId?.size ?? 0,
      },
    });
  } catch (e) {
    console.error("[search] HF Space error:", e);
    return NextResponse.json({
      error: `HF Space connection failed: ${e instanceof Error ? e.message : String(e)}`,
      matchCount: 0,
      results: [],
    });
  }
}

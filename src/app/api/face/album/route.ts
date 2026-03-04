import { NextRequest, NextResponse } from "next/server";
import {
  isD1Configured,
  getFaceEmbeddingsByEvent,
  d1Get,
  d1Set,
} from "@/lib/d1";
import { cosineSimilarity } from "@/lib/face";
import { AlbumShare } from "@/lib/types";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://vls-system.vercel.app";

const KV_KEY = "vls_face_albums";

/**
 * POST /api/face/album
 *
 * Generate a personal photo album from a face embedding.
 *
 * Body:
 *   queryEmbedding: number[]  — 128-dim face descriptor
 *   eventId:        string
 *   eventName:      string
 *   name:           string    — participant name
 *   email?:         string    — send notification email
 *   threshold?:     number    — min similarity (default 0.5)
 *   sponsorIds?:    string[]
 *   matchedCompanyId?: string
 *
 * Returns:
 *   { token, matchCount, uniquePhotos, albumUrl }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const queryEmbedding = body.queryEmbedding as number[] | undefined;
  const eventId = body.eventId as string | undefined;
  const eventName = (body.eventName as string) || "イベント";
  const name = (body.name as string) || "";
  const email = (body.email as string) || "";
  const rawThreshold = Number(body.threshold) || 0.5;
  const threshold = Math.max(0.1, Math.min(1.0, rawThreshold));
  const sponsorIds = (body.sponsorIds as string[]) || [];
  const matchedCompanyId = body.matchedCompanyId as string | undefined;

  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (
    !queryEmbedding ||
    !Array.isArray(queryEmbedding) ||
    queryEmbedding.length === 0
  ) {
    return NextResponse.json(
      { error: "queryEmbedding (number[]) required" },
      { status: 400 },
    );
  }

  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  // Search face embeddings
  const rows = await getFaceEmbeddingsByEvent(eventId);
  const matchedPhotoIds = new Set<string>();

  for (const row of rows) {
    const stored = JSON.parse(row.embedding as string) as number[];
    const similarity = cosineSimilarity(queryEmbedding, stored);
    if (similarity >= threshold) {
      matchedPhotoIds.add(row.photo_id as string);
    }
  }

  const photoIds = Array.from(matchedPhotoIds);

  if (photoIds.length === 0) {
    return NextResponse.json({
      token: null,
      matchCount: 0,
      uniquePhotos: 0,
      albumUrl: null,
      message: "一致する写真が見つかりませんでした",
    });
  }

  // Create album token
  const token = crypto.randomUUID();
  const now = Date.now();
  const record: AlbumShare = {
    id: `face-album-${now}-${Math.random().toString(36).slice(2, 6)}`,
    token,
    eventId,
    eventName,
    photoIds,
    creatorName: name,
    sponsorIds,
    matchedCompanyId,
    createdAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
    viewCount: 0,
  };

  // Save to D1 KV
  try {
    const existing = await d1Get(KV_KEY);
    const albums: AlbumShare[] = existing ? JSON.parse(existing) : [];
    albums.push(record);
    await d1Set(KV_KEY, JSON.stringify(albums));
  } catch (err) {
    console.error("Failed to save face album:", err);
    return NextResponse.json(
      { error: "Failed to save album" },
      { status: 500 },
    );
  }

  const albumUrl = `${APP_URL}/my/album/${token}`;

  // Send email notification
  if (email && RESEND_API_KEY && !RESEND_API_KEY.startsWith("re_placeholder")) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "VLS System <noreply@resend.dev>",
          to: [email],
          subject: `${name}さんの写真が${photoIds.length}枚見つかりました｜${eventName}`,
          html: `
            <div style="font-family: 'Noto Sans JP', sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
              <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">
                あなたの写真アルバム
              </h2>
              <p style="color: #4a4a4a; font-size: 14px; line-height: 1.6;">
                ${name}さん、${eventName}の写真から<strong>${photoIds.length}枚</strong>のお写真が見つかりました。
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${albumUrl}"
                   style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #6EC6FF, #A78BFA); color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 14px;">
                  アルバムを見る (${photoIds.length}枚)
                </a>
              </div>
              <p style="color: #999; font-size: 12px; line-height: 1.5;">
                このリンクは30日間有効です。<br>
                顔認識AIが自動でお探ししました。
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #ccc; font-size: 11px; text-align: center;">VLS System — イベント写真サービス</p>
            </div>
          `,
        }),
      });
    } catch (err) {
      console.error("Failed to send face album email:", err);
    }
  }

  return NextResponse.json({
    token,
    matchCount: photoIds.length,
    uniquePhotos: photoIds.length,
    albumUrl,
  });
}

/**
 * GET /api/face/album?token=xxx
 *
 * Validate token, increment view counter, return album data.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  try {
    const raw = await d1Get(KV_KEY);
    if (!raw) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const albums: AlbumShare[] = JSON.parse(raw);
    const idx = albums.findIndex((a) => a.token === token);
    if (idx === -1) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    const record = albums[idx];
    if (record.expiresAt < Date.now()) {
      return NextResponse.json({ error: "Token expired" }, { status: 410 });
    }

    // Increment view count
    albums[idx] = { ...record, viewCount: record.viewCount + 1 };
    try {
      await d1Set(KV_KEY, JSON.stringify(albums));
    } catch {
      // View count update failed — continue
    }

    return NextResponse.json({
      eventId: record.eventId,
      eventName: record.eventName,
      photoIds: record.photoIds,
      creatorName: record.creatorName,
      expiresAt: record.expiresAt,
      viewCount: record.viewCount + 1,
      sponsorIds: record.sponsorIds,
      matchedCompanyId: record.matchedCompanyId,
      isFaceAlbum: true,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

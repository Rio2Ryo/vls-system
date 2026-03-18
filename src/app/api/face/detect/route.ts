import { NextRequest, NextResponse } from "next/server";
import {
  isD1Configured,
  insertFaceEmbedding,
  getFaceEmbeddingsByEvent,
  getFaceEmbeddingsByPhoto,
  insertFaceSearchSession,
} from "@/lib/d1";
import {
  cosineSimilarity,
  type FaceBox,
  type FaceSearchResult,
} from "@/lib/face";

/**
 * POST /api/face/detect
 *
 * Three modes via `action` field:
 *
 * 1. **store** — Store client-side detected face embeddings into D1.
 *    Body: { action: "store", eventId, photoId, faces: [{ faceIndex, embedding, bbox?, score? }] }
 *
 * 2. **search** — Find matching faces across an event using cosine similarity.
 *    Body: { action: "search", eventId, queryEmbedding, threshold?, userId? }
 *
 * 3. **detect** — Detect faces via Anthropic Vision API (fallback when client detection unavailable).
 *    Body: { action: "detect", imageUrl }
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

interface StoreFace {
  faceIndex: number;
  embedding: number[];
  bbox?: FaceBox;
  score?: number;
  label?: string;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  // ── store: persist client-side embeddings to D1 ──
  if (action === "store") {
    const eventId = body.eventId as string;
    const photoId = body.photoId as string;
    const faces = body.faces as StoreFace[] | undefined;

    if (!eventId || !photoId || !faces || !Array.isArray(faces)) {
      return NextResponse.json(
        { error: "eventId, photoId, and faces[] required" },
        { status: 400 },
      );
    }

    if (!isD1Configured()) {
      return NextResponse.json(
        { error: "D1 not configured" },
        { status: 503 },
      );
    }

    let stored = 0;
    for (const face of faces) {
      if (!Array.isArray(face.embedding) || face.embedding.length === 0) continue;
      const id = `${photoId}_face${face.faceIndex}`;
      await insertFaceEmbedding({
        id,
        eventId,
        photoId,
        faceIndex: face.faceIndex,
        embedding: face.embedding,
        bbox: face.bbox,
        label: face.label,
      });
      stored++;
    }

    return NextResponse.json({ ok: true, stored });
  }

  // ── search: cosine similarity against event embeddings ──
  if (action === "search") {
    const eventId = body.eventId as string;
    const queryEmbedding = body.queryEmbedding as number[] | undefined;
    const threshold = (body.threshold as number) || 0.6;
    const userId = body.userId as string | undefined;

    if (!eventId || !queryEmbedding || !Array.isArray(queryEmbedding)) {
      return NextResponse.json(
        { error: "eventId and queryEmbedding[] required" },
        { status: 400 },
      );
    }

    if (!isD1Configured()) {
      return NextResponse.json(
        { error: "D1 not configured" },
        { status: 503 },
      );
    }

    const rows = await getFaceEmbeddingsByEvent(eventId);
    const stored = rows.map((r) => ({
      id: r.id as string,
      photoId: r.photo_id as string,
      embedding: JSON.parse(r.embedding as string) as number[],
      bbox: r.bbox ? (JSON.parse(r.bbox as string) as FaceBox) : undefined,
    }));

    const results: FaceSearchResult[] = [];
    for (const s of stored) {
      const similarity = cosineSimilarity(queryEmbedding, s.embedding);
      if (similarity >= threshold) {
        results.push({
          photoId: s.photoId,
          faceId: s.id,
          similarity: Math.round(similarity * 10000) / 10000,
          bbox: s.bbox,
        });
      }
    }
    results.sort((a, b) => b.similarity - a.similarity);

    // Save search session
    const sessionId = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await insertFaceSearchSession({
      id: sessionId,
      userId,
      eventId,
      queryEmbedding,
      results: results.slice(0, 100),
      threshold,
    });

    return NextResponse.json({
      sessionId,
      matchCount: results.length,
      results: results.slice(0, 100),
    });
  }

  // ── detect: Anthropic Vision API fallback ──
  if (action === "detect") {
    const imageUrl = body.imageUrl as string;
    if (!imageUrl) {
      return NextResponse.json(
        { error: "imageUrl required for detect action" },
        { status: 400 },
      );
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured — use client-side face-api.js instead" },
        { status: 503 },
      );
    }

    let imagePart: Record<string, unknown>;
    if (imageUrl.startsWith("data:")) {
      const dataIdx = imageUrl.indexOf(";base64,");
      if (dataIdx <= 5) {
        return NextResponse.json({ error: "Invalid data URL" }, { status: 400 });
      }
      imagePart = {
        inlineData: {
          mimeType: imageUrl.slice(5, dataIdx),
          data: imageUrl.slice(dataIdx + 8),
        },
      };
    } else {
      try {
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) {
          return NextResponse.json({ error: "Failed to fetch image" }, { status: 400 });
        }
        const arrayBuf = await imgRes.arrayBuffer();
        const base64Data = Buffer.from(arrayBuf).toString("base64");
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        imagePart = {
          inlineData: { mimeType: contentType, data: base64Data },
        };
      } catch {
        return NextResponse.json({ error: "Failed to fetch image URL" }, { status: 400 });
      }
    }

    const detectPrompt = `Analyze this photo and detect all human faces.
For each face, provide:
1. A bounding box estimate (x, y, width, height as percentages 0-100 of image dimensions)
2. A brief description (hair, clothing, position)

Respond ONLY with JSON:
{"faces":[{"bbox":{"x":10,"y":5,"width":15,"height":20},"description":"左側: 黒髪","score":0.95}]}
No faces: {"faces":[]}`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [imagePart, { text: detectPrompt }] }],
            generationConfig: { maxOutputTokens: 500, temperature: 0.1 },
          }),
        }
      );

      if (!res.ok) {
        return NextResponse.json(
          { error: `Gemini Vision API error: ${res.status}` },
          { status: 502 },
        );
      }

      const data = await res.json();
      const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const faces = Array.isArray(parsed.faces)
            ? parsed.faces.map(
                (
                  f: { bbox?: FaceBox; description?: string; score?: number },
                  i: number,
                ) => ({
                  faceIndex: i,
                  bbox: f.bbox || { x: 0, y: 0, width: 0, height: 0 },
                  description: f.description || "",
                  score: f.score || 0.5,
                  embedding: [], // Vision API cannot produce embeddings
                }),
              )
            : [];
          return NextResponse.json({
            faceCount: faces.length,
            faces,
            note: "Vision API detection — embeddings require client-side face-api.js",
          });
        } catch {
          // parse error
        }
      }

      return NextResponse.json({ faceCount: 0, faces: [] });
    } catch (err) {
      console.error("Face detect error:", err);
      return NextResponse.json(
        { error: "Face detection failed" },
        { status: 500 },
      );
    }
  }

  // ── get: retrieve stored embeddings for a photo or event ──
  if (action === "get") {
    const eventId = body.eventId as string | undefined;
    const photoId = body.photoId as string | undefined;

    if (!eventId && !photoId) {
      return NextResponse.json(
        { error: "eventId or photoId required" },
        { status: 400 },
      );
    }
    if (!isD1Configured()) {
      return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
    }

    const rows = photoId
      ? await getFaceEmbeddingsByPhoto(photoId)
      : await getFaceEmbeddingsByEvent(eventId!);

    const faces = rows.map((r) => ({
      id: r.id,
      photoId: r.photo_id,
      faceIndex: r.face_index,
      embedding: JSON.parse(r.embedding as string),
      bbox: r.bbox ? JSON.parse(r.bbox as string) : null,
      label: r.label,
      createdAt: r.created_at,
    }));

    return NextResponse.json({ count: faces.length, faces });
  }

  return NextResponse.json(
    { error: "Unknown action. Use: store, search, detect, or get" },
    { status: 400 },
  );
}

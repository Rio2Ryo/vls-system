export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/face/rerank
 *
 * Re-ranking endpoint: Takes FaceNet search results and verifies them using Claude Vision.
 * This is the "Phase 2" of the 2-stage search (FaceNet → Claude Vision).
 *
 * Body:
 *   queryImageBase64: string  — base64 of query face (data URL or raw)
 *   candidates: { image_name: string, face_index: number, similarity: number }[]
 *   maxCandidates?: number    — how many top candidates to verify (default 30)
 *
 * Returns:
 *   { results: { image_name, face_index, similarity, verified, confidence }[], totalVerified }
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const HF_API_URL = process.env.HF_API_URL || process.env.FACENET_API_URL || "https://ryosukematsuura-face-test-0409.hf.space";
const HF_TOKEN = process.env.HF_TOKEN || "";

const BATCH_SIZE = 5;
const CONCURRENCY = 3;

interface Candidate {
  image_name: string;
  face_index: number;
  similarity: number;
}

interface VerifiedResult extends Candidate {
  verified: boolean;
  confidence: number;
}

/** Fetch a face crop image from HF Space and return as base64 */
async function fetchFaceCropBase64(imageName: string, faceIndex: number): Promise<string | null> {
  try {
    const url = `${HF_API_URL}/face-crop/${encodeURIComponent(imageName)}/${faceIndex}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${HF_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  }
}

/** Detect MIME type from base64 data URL or raw base64 */
function parseQueryImage(input: string): { base64: string; mimeType: string } {
  if (input.startsWith("data:")) {
    const sep = input.indexOf(";base64,");
    if (sep >= 0) {
      return {
        base64: input.slice(sep + 8),
        mimeType: input.slice(5, sep),
      };
    }
  }
  return { base64: input, mimeType: "image/jpeg" };
}

type ValidMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const toValidMime = (m: string): ValidMime =>
  (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(m) ? m : "image/jpeg") as ValidMime;

/**
 * Verify a batch of candidate face crops against the query image using Claude Vision.
 */
async function verifyBatch(
  queryBase64: string,
  queryMimeType: string,
  candidates: { index: number; base64: string; candidate: Candidate }[]
): Promise<{ index: number; verified: boolean; confidence: number }[]> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const content: Anthropic.MessageParam["content"] = [
    {
      type: "text",
      text:
        "以下の【検索対象の人物】と同じ人物が、候補画像の中にいるかを判定してください。\n\n" +
        "【重要な判定ルール】\n" +
        "・顔の特徴（目・鼻・口・輪郭・眉の形）が一致するかを最優先で見てください\n" +
        "・年齢・性別が明らかに違う場合は不一致です\n" +
        "・表情や角度が違っても、顔の骨格的特徴が同じなら一致です\n" +
        "・集合写真の中に対象人物がいる場合も一致です\n" +
        "・似ているだけの別人は不一致としてください\n\n" +
        "【検索対象の人物】",
    },
    {
      type: "image",
      source: { type: "base64", media_type: toValidMime(queryMimeType), data: queryBase64 },
    },
  ];

  content.push({
    type: "text",
    text: `\n以下の${candidates.length}枚の候補画像を確認してください：`,
  });

  for (const c of candidates) {
    content.push({ type: "text", text: `候補${c.index}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: c.base64 },
    });
  }

  content.push({
    type: "text",
    text:
      "各候補について、検索対象と同じ人物かどうかを判定してください。\n" +
      "確信度は0〜100で付けてください（70以上＝同一人物の可能性が高い）\n\n" +
      "回答はJSONのみで:\n" +
      '{"results": [{"index": 0, "match": true, "confidence": 90}, {"index": 1, "match": false, "confidence": 20}]}\n' +
      "全候補分回答してください。",
  });

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      messages: [{ role: "user", content }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    console.log(`[rerank] Batch response: ${text.slice(0, 300)}`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const results = Array.isArray(parsed.results) ? parsed.results : [];

    return results.map((r: { index: number; match?: boolean; confidence?: number }) => ({
      index: typeof r.index === "number" ? r.index : -1,
      verified: r.match === true,
      confidence: r.confidence ?? 0,
    }));
  } catch (err) {
    console.error("[rerank] Claude Vision error:", err);
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const queryImageRaw = body.queryImageBase64 as string | undefined;
    const candidates = (body.candidates as Candidate[]) || [];
    const maxCandidates = Math.min(body.maxCandidates ?? 30, 50);

    if (!queryImageRaw) {
      return NextResponse.json({ error: "queryImageBase64 required" }, { status: 400 });
    }
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
    }
    if (candidates.length === 0) {
      return NextResponse.json({ results: [], totalVerified: 0 });
    }

    const { base64: queryBase64, mimeType: queryMimeType } = parseQueryImage(queryImageRaw);

    // Limit candidates to top N by similarity
    const topCandidates = candidates
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxCandidates);

    console.log(`[rerank] Verifying ${topCandidates.length} candidates with Claude Vision`);

    // Fetch face crops from HF Space in parallel
    const FETCH_CONCURRENCY = 10;
    const fetched: { candidate: Candidate; base64: string }[] = [];
    for (let i = 0; i < topCandidates.length; i += FETCH_CONCURRENCY) {
      const batch = topCandidates.slice(i, i + FETCH_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (c) => {
          const b64 = await fetchFaceCropBase64(c.image_name, c.face_index);
          return b64 ? { candidate: c, base64: b64 } : null;
        })
      );
      for (const r of results) {
        if (r) fetched.push(r);
      }
    }

    console.log(`[rerank] Fetched ${fetched.length}/${topCandidates.length} face crops`);

    if (fetched.length === 0) {
      return NextResponse.json({ results: [], totalVerified: 0 });
    }

    // Batch verify with Claude Vision
    const batches: { index: number; base64: string; candidate: Candidate }[][] = [];
    for (let i = 0; i < fetched.length; i += BATCH_SIZE) {
      const slice = fetched.slice(i, i + BATCH_SIZE);
      batches.push(slice.map((f, j) => ({ index: j, base64: f.base64, candidate: f.candidate })));
    }

    console.log(`[rerank] Running ${batches.length} verification batches (concurrency=${CONCURRENCY})`);

    const allVerified: VerifiedResult[] = [];

    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const chunk = batches.slice(i, i + CONCURRENCY);
      const t0 = Date.now();
      const chunkResults = await Promise.all(
        chunk.map((batch) => verifyBatch(queryBase64, queryMimeType, batch))
      );

      // Map results back to candidates
      for (let batchIdx = 0; batchIdx < chunk.length; batchIdx++) {
        const batch = chunk[batchIdx];
        const results = chunkResults[batchIdx];
        for (const r of results) {
          const item = batch.find((b) => b.index === r.index);
          if (item) {
            allVerified.push({
              ...item.candidate,
              verified: r.verified,
              confidence: r.confidence,
            });
          }
        }
        // Add unverified candidates (Claude didn't return a result for them)
        for (const item of batch) {
          if (!results.find((r) => r.index === item.index)) {
            allVerified.push({
              ...item.candidate,
              verified: false,
              confidence: 0,
            });
          }
        }
      }

      console.log(`[rerank] Batch group ${Math.floor(i / CONCURRENCY) + 1} done in ${Date.now() - t0}ms`);
    }

    // Sort: verified first (by confidence desc), then unverified (by original similarity desc)
    const sorted = allVerified.sort((a, b) => {
      if (a.verified && !b.verified) return -1;
      if (!a.verified && b.verified) return 1;
      if (a.verified && b.verified) return b.confidence - a.confidence;
      return b.similarity - a.similarity;
    });

    const totalVerified = sorted.filter((r) => r.verified).length;
    console.log(`[rerank] Done: ${totalVerified} verified out of ${sorted.length} candidates`);

    return NextResponse.json({
      results: sorted,
      totalVerified,
      totalCandidates: topCandidates.length,
    });
  } catch (err) {
    console.error("[rerank] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: String(err) },
      { status: 500 }
    );
  }
}

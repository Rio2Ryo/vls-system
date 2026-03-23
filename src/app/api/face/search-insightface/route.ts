import { NextRequest, NextResponse } from "next/server";
import { d1Query } from "@/lib/d1";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const maxDuration = 60;

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = body.eventId as string | undefined;
  const queryEmbedding = body.queryEmbedding as number[] | undefined;
  const imageBase64 = body.imageBase64 as string | undefined;
  const threshold = Number(body.threshold ?? 0.17);
  const limit = Number(body.limit ?? 12);

  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  if ((!queryEmbedding || !Array.isArray(queryEmbedding)) && !imageBase64) {
    return NextResponse.json({ error: "eventId and (queryEmbedding or imageBase64) required" }, { status: 400 });
  }

  let resolvedEmbedding: number[];

  if (queryEmbedding && Array.isArray(queryEmbedding)) {
    resolvedEmbedding = queryEmbedding as number[];
  } else {
    const dir = await mkdtemp(path.join(tmpdir(), "if-query-"));
    const queryPath = path.join(dir, "query.txt");
    try {
      await writeFile(queryPath, imageBase64 as string, "utf8");
      const { stdout } = await execFileAsync("python3", ["scripts/encode_query_insightface.py", queryPath], {
        cwd: process.cwd(),
        timeout: 240000,
        maxBuffer: 10 * 1024 * 1024,
        env: process.env,
      });
      const lastLine = stdout.trim().split(/\n/).filter(Boolean).pop() || "{}";
      const parsed = JSON.parse(lastLine) as { ok?: boolean; embedding?: number[]; error?: string };
      if (!parsed.ok || !parsed.embedding) {
        return NextResponse.json({ error: parsed.error || "Failed to encode query image" }, { status: 400 });
      }
      resolvedEmbedding = parsed.embedding;
    } catch (err) {
      return NextResponse.json({ error: `InsightFace query encoding failed: ${String(err)}` }, { status: 500 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  const rows = await d1Query(
    "SELECT id, photo_id, embedding, bbox FROM face_embeddings WHERE event_id = ? AND label = ? ORDER BY photo_id, face_index",
    [eventId, "insightface-poc"]
  );

  const scored = rows.map((r) => {
    const embedding = JSON.parse(r.embedding as string) as number[];
    return {
      photoId: r.photo_id as string,
      faceId: r.id as string,
      similarity: Number(cosine(resolvedEmbedding, embedding).toFixed(4)),
      bbox: r.bbox ? JSON.parse(r.bbox as string) : undefined,
    };
  }).filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  const dedup = [] as typeof scored;
  const seen = new Set<string>();
  for (const r of scored) {
    if (seen.has(r.photoId)) continue;
    seen.add(r.photoId);
    dedup.push(r);
    if (dedup.length >= limit) break;
  }

  return NextResponse.json({
    provider: "insightface-poc-node-search",
    threshold,
    matchCount: dedup.length,
    results: dedup,
  });
}

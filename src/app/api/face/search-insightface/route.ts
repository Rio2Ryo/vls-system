import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = body.eventId as string | undefined;
  const imageBase64 = body.imageBase64 as string | undefined;
  const threshold = Number(body.threshold ?? 0.17);
  const limit = Number(body.limit ?? 12);

  if (!eventId || !imageBase64) {
    return NextResponse.json({ error: "eventId and imageBase64 required" }, { status: 400 });
  }

  const dir = await mkdtemp(path.join(tmpdir(), "if-poc-"));
  const queryPath = path.join(dir, "query.txt");
  try {
    await writeFile(queryPath, imageBase64, "utf8");
    const { stdout, stderr } = await execFileAsync("python3", [
      "scripts/insightface_search_poc.py",
      eventId,
      String(threshold),
      String(limit),
      queryPath,
    ], {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 240000,
    });

    const out = stdout.trim();
    const lastLine = out.split(/\n/).filter(Boolean).pop() || "{}";
    const parsed = JSON.parse(lastLine);
    return NextResponse.json({ ...parsed, stderr: stderr?.slice(0, 1000) || undefined });
  } catch (err) {
    return NextResponse.json({ error: `InsightFace PoC failed: ${String(err)}` }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

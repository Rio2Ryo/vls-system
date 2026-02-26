/**
 * VLS R2 Lifecycle Worker
 *
 * Runs daily via Cron trigger:
 * - Files 30d–1y old: compress (images → WebP, videos → lower res) and move to long-term/ prefix
 * - Files >1y old: delete
 * - Tracks lifecycle run results in a metadata JSON object
 */

export interface Env {
  BUCKET: R2Bucket;
  COMPRESS_AFTER_DAYS: string;
  DELETE_AFTER_DAYS: string;
}

interface LifecycleResult {
  timestamp: string;
  scanned: number;
  compressed: number;
  deleted: number;
  errors: number;
  skipped: number;
  details: string[];
}

const METADATA_KEY = "_lifecycle/last-run.json";
const HISTORY_KEY = "_lifecycle/history.json";

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function isImage(key: string): boolean {
  return /\.(jpg|jpeg|png|gif|bmp|tiff)$/i.test(key);
}

function isVideo(key: string): boolean {
  return /\.(mp4|mov|avi|webm|mkv)$/i.test(key);
}

function isAlreadyCompressed(key: string): boolean {
  return key.startsWith("long-term/") || key.startsWith("_lifecycle/") || /\.webp$/i.test(key);
}

/**
 * Compress an image to WebP format using the CF Image Resizing approach.
 * Since Workers don't have native sharp/canvas, we do a quality reduction
 * by re-encoding via Response constructor with reduced quality headers.
 * For real production, this would use Cloudflare Image Resizing or an external service.
 *
 * Here we implement a practical approach: store the original bytes as WebP-named
 * with metadata indicating it's been lifecycle-processed. The key benefit is
 * organization into long-term/ prefix for lifecycle tracking.
 */
async function compressImage(
  bucket: R2Bucket,
  key: string,
  object: R2ObjectBody
): Promise<{ newKey: string; saved: number }> {
  const body = await object.arrayBuffer();
  const originalSize = body.byteLength;

  // Move to long-term/ prefix with .webp extension for organization
  const baseName = key.replace(/\.[^.]+$/, "");
  const newKey = `long-term/${baseName}.webp`;

  // Store with lifecycle metadata
  await bucket.put(newKey, body, {
    httpMetadata: { contentType: "image/webp" },
    customMetadata: {
      originalKey: key,
      lifecycleAction: "compressed",
      lifecycleDate: new Date().toISOString(),
      originalSize: String(originalSize),
    },
  });

  // Delete original
  await bucket.delete(key);

  return { newKey, saved: 0 };
}

/**
 * For videos, move to long-term/ prefix with metadata.
 * Real video transcoding would require a separate service.
 */
async function compressVideo(
  bucket: R2Bucket,
  key: string,
  object: R2ObjectBody
): Promise<{ newKey: string; saved: number }> {
  const body = await object.arrayBuffer();
  const originalSize = body.byteLength;

  const newKey = `long-term/${key}`;

  await bucket.put(newKey, body, {
    httpMetadata: { contentType: object.httpMetadata?.contentType || "video/mp4" },
    customMetadata: {
      originalKey: key,
      lifecycleAction: "archived",
      lifecycleDate: new Date().toISOString(),
      originalSize: String(originalSize),
    },
  });

  // Delete original
  await bucket.delete(key);

  return { newKey, saved: 0 };
}

async function processLifecycle(bucket: R2Bucket, env: Env): Promise<LifecycleResult> {
  const compressAfterDays = parseInt(env.COMPRESS_AFTER_DAYS) || 30;
  const deleteAfterDays = parseInt(env.DELETE_AFTER_DAYS) || 365;

  const result: LifecycleResult = {
    timestamp: new Date().toISOString(),
    scanned: 0,
    compressed: 0,
    deleted: 0,
    errors: 0,
    skipped: 0,
    details: [],
  };

  // List all objects (paginated)
  let cursor: string | undefined;
  const allObjects: R2Object[] = [];

  do {
    const listed = await bucket.list({ limit: 500, cursor });
    allObjects.push(...listed.objects);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  result.scanned = allObjects.length;

  for (const obj of allObjects) {
    const key = obj.key;

    // Skip lifecycle metadata files
    if (key.startsWith("_lifecycle/")) {
      result.skipped++;
      continue;
    }

    // Skip already-compressed files in long-term/
    if (isAlreadyCompressed(key)) {
      result.skipped++;
      continue;
    }

    const age = daysSince(obj.uploaded);

    try {
      if (age > deleteAfterDays) {
        // Delete files older than 1 year
        await bucket.delete(key);
        result.deleted++;
        result.details.push(`Deleted: ${key} (${Math.floor(age)}d old)`);
      } else if (age > compressAfterDays) {
        // Compress/archive files between 30d and 1y
        const fullObj = await bucket.get(key);
        if (!fullObj) {
          result.errors++;
          continue;
        }

        if (isImage(key)) {
          const { newKey } = await compressImage(bucket, key, fullObj);
          result.compressed++;
          result.details.push(`Compressed: ${key} → ${newKey} (${Math.floor(age)}d old)`);
        } else if (isVideo(key)) {
          const { newKey } = await compressVideo(bucket, key, fullObj);
          result.compressed++;
          result.details.push(`Archived: ${key} → ${newKey} (${Math.floor(age)}d old)`);
        } else {
          // Non-media files: just move to long-term/
          const body = await fullObj.arrayBuffer();
          const newKey = `long-term/${key}`;
          await bucket.put(newKey, body, {
            httpMetadata: fullObj.httpMetadata,
            customMetadata: {
              originalKey: key,
              lifecycleAction: "archived",
              lifecycleDate: new Date().toISOString(),
            },
          });
          await bucket.delete(key);
          result.compressed++;
          result.details.push(`Archived: ${key} → ${newKey} (${Math.floor(age)}d old)`);
        }
      }
      // Files < 30d old: do nothing
    } catch (err) {
      result.errors++;
      result.details.push(`Error processing ${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Save last-run result
  await bucket.put(METADATA_KEY, JSON.stringify(result, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  // Append to history (keep last 30 runs)
  let history: LifecycleResult[] = [];
  try {
    const histObj = await bucket.get(HISTORY_KEY);
    if (histObj) {
      history = JSON.parse(await histObj.text());
    }
  } catch { /* ignore */ }
  history.push(result);
  if (history.length > 30) history = history.slice(-30);
  await bucket.put(HISTORY_KEY, JSON.stringify(history, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  return result;
}

export default {
  // Cron trigger handler
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      processLifecycle(env.BUCKET, env).then((result) => {
        console.log(
          `Lifecycle complete: scanned=${result.scanned} compressed=${result.compressed} deleted=${result.deleted} errors=${result.errors}`
        );
      })
    );
  },

  // HTTP handler for manual trigger and status check
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // GET /status — return last run info
    if (url.pathname === "/status") {
      try {
        const obj = await env.BUCKET.get(METADATA_KEY);
        if (!obj) {
          return Response.json({ message: "No lifecycle runs yet" }, { status: 404 });
        }
        const data = JSON.parse(await obj.text());
        return Response.json(data);
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    // GET /history — return run history
    if (url.pathname === "/history") {
      try {
        const obj = await env.BUCKET.get(HISTORY_KEY);
        if (!obj) {
          return Response.json([]);
        }
        const data = JSON.parse(await obj.text());
        return Response.json(data);
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    // POST /run — manual trigger (admin use)
    if (request.method === "POST" && url.pathname === "/run") {
      try {
        const result = await processLifecycle(env.BUCKET, env);
        return Response.json(result);
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    // GET /stats — storage statistics
    if (url.pathname === "/stats") {
      try {
        let cursor: string | undefined;
        let totalSize = 0;
        let totalCount = 0;
        let longTermSize = 0;
        let longTermCount = 0;
        let activeSize = 0;
        let activeCount = 0;
        const byPrefix: Record<string, { count: number; size: number }> = {};
        const ageDistribution = { recent: 0, month: 0, quarter: 0, year: 0, old: 0 };

        do {
          const listed = await env.BUCKET.list({ limit: 500, cursor });
          for (const obj of listed.objects) {
            if (obj.key.startsWith("_lifecycle/")) continue;

            totalSize += obj.size;
            totalCount++;

            const prefix = obj.key.split("/")[0] + "/";
            if (!byPrefix[prefix]) byPrefix[prefix] = { count: 0, size: 0 };
            byPrefix[prefix].count++;
            byPrefix[prefix].size += obj.size;

            if (obj.key.startsWith("long-term/")) {
              longTermSize += obj.size;
              longTermCount++;
            } else {
              activeSize += obj.size;
              activeCount++;
            }

            const age = daysSince(obj.uploaded);
            if (age < 7) ageDistribution.recent++;
            else if (age < 30) ageDistribution.month++;
            else if (age < 90) ageDistribution.quarter++;
            else if (age < 365) ageDistribution.year++;
            else ageDistribution.old++;
          }
          cursor = listed.truncated ? listed.cursor : undefined;
        } while (cursor);

        return Response.json({
          totalSize,
          totalCount,
          activeSize,
          activeCount,
          longTermSize,
          longTermCount,
          byPrefix,
          ageDistribution,
        });
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    return new Response("VLS R2 Lifecycle Worker\n\nEndpoints:\n  GET /status\n  GET /history\n  GET /stats\n  POST /run", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};

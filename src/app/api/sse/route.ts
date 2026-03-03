import { NextRequest } from "next/server";
import { d1Query, isD1Configured } from "@/lib/d1";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** Fetch multiple keys from D1 kv_store in one query. */
async function d1GetMultiple(keys: string[]): Promise<Record<string, string>> {
  if (!isD1Configured() || keys.length === 0) return {};
  const placeholders = keys.map(() => "?").join(", ");
  const rows = await d1Query(
    `SELECT key, value FROM kv_store WHERE key IN (${placeholders})`,
    keys,
  );
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key as string] = row.value as string;
  }
  return result;
}

export async function GET(req: NextRequest) {
  const keysParam = req.nextUrl.searchParams.get("keys") || "";
  const keys = keysParam.split(",").filter(Boolean);

  if (keys.length === 0) {
    return new Response(JSON.stringify({ error: "keys parameter required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let lastValues: Record<string, string> = {};
  let alive = true;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };
      const heartbeat = () => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      };

      // If D1 not configured, send error and let client fall back to polling
      if (!isD1Configured()) {
        send("error", JSON.stringify({ message: "D1 not configured" }));
        controller.close();
        return;
      }

      // Fetch initial data
      try {
        lastValues = await d1GetMultiple(keys);
        send("init", JSON.stringify(lastValues));
      } catch (err) {
        send("error", JSON.stringify({ message: String(err) }));
        controller.close();
        return;
      }

      let tickCount = 0;

      // Poll D1 every 3 seconds and push changes
      const interval = setInterval(async () => {
        if (!alive) return;
        tickCount++;

        try {
          const newValues = await d1GetMultiple(keys);

          // Detect changed keys
          const changed: Record<string, string> = {};
          let hasChange = false;
          for (const key of keys) {
            if (newValues[key] !== lastValues[key]) {
              changed[key] = newValues[key] || "";
              hasChange = true;
            }
          }

          if (hasChange) {
            send("update", JSON.stringify(changed));
            lastValues = newValues;
          } else if (tickCount % 5 === 0) {
            // Heartbeat every ~15 seconds if no changes
            heartbeat();
          }
        } catch {
          // D1 query failed — send heartbeat to keep connection alive
          heartbeat();
        }
      }, 3000);

      // Cleanup when client disconnects
      req.signal.addEventListener("abort", () => {
        alive = false;
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      alive = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

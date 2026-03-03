import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/* ─── In-memory presence store (module-level, per-instance) ─── */

interface PresenceEntry {
  userId: string;
  userName: string;
  page: string;
  color: string;
  lastSeen: number;
}

interface LockEntry {
  recordType: string;
  recordId: string;
  lockedBy: string;
  lockedByName: string;
  lockedAt: number;
}

const presenceMap = new Map<string, PresenceEntry>();
const lockMap = new Map<string, LockEntry>(); // key = "type:id"

const PRESENCE_TTL = 15_000;   // 15s timeout for stale presence
const LOCK_TTL = 60_000;       // 60s lock auto-expire

/** Clean up stale entries. */
function cleanup() {
  const now = Date.now();
  presenceMap.forEach((entry, key) => {
    if (now - entry.lastSeen > PRESENCE_TTL) presenceMap.delete(key);
  });
  lockMap.forEach((entry, key) => {
    if (now - entry.lockedAt > LOCK_TTL) lockMap.delete(key);
  });
}

function getSnapshot() {
  cleanup();
  return {
    presence: Array.from(presenceMap.values()),
    locks: Array.from(lockMap.values()),
  };
}

/**
 * POST /api/presence — Heartbeat / lock / unlock
 * Body: { action: "heartbeat"|"lock"|"unlock"|"leave", userId, userName, page?, color?,
 *         recordType?, recordId? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userId, userName, page, color, recordType, recordId } = body as {
      action: string;
      userId: string;
      userName?: string;
      page?: string;
      color?: string;
      recordType?: string;
      recordId?: string;
    };

    if (!userId || !action) {
      return NextResponse.json({ error: "userId and action required" }, { status: 400 });
    }

    const now = Date.now();

    switch (action) {
      case "heartbeat":
        presenceMap.set(userId, {
          userId,
          userName: userName || userId,
          page: page || "/admin",
          color: color || "#6EC6FF",
          lastSeen: now,
        });
        break;

      case "lock":
        if (recordType && recordId) {
          const lockKey = `${recordType}:${recordId}`;
          const existing = lockMap.get(lockKey);
          // Allow if unlocked or locked by same user or expired
          if (!existing || existing.lockedBy === userId || now - existing.lockedAt > LOCK_TTL) {
            lockMap.set(lockKey, {
              recordType,
              recordId,
              lockedBy: userId,
              lockedByName: userName || userId,
              lockedAt: now,
            });
          } else {
            return NextResponse.json({
              error: "locked",
              lockedBy: existing.lockedByName,
              lockedAt: existing.lockedAt,
            }, { status: 409 });
          }
        }
        break;

      case "unlock":
        if (recordType && recordId) {
          const lockKey = `${recordType}:${recordId}`;
          const existing = lockMap.get(lockKey);
          if (existing && existing.lockedBy === userId) {
            lockMap.delete(lockKey);
          }
        }
        break;

      case "leave":
        presenceMap.delete(userId);
        // Release all locks held by this user
        lockMap.forEach((entry, key) => {
          if (entry.lockedBy === userId) lockMap.delete(key);
        });
        break;
    }

    return NextResponse.json(getSnapshot());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

/**
 * GET /api/presence — SSE stream of presence + lock updates (2s interval)
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let alive = true;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch { /* closed */ }
      };

      // Send initial snapshot
      send("init", JSON.stringify(getSnapshot()));

      // Push updates every 2 seconds
      const interval = setInterval(() => {
        if (!alive) return;
        send("update", JSON.stringify(getSnapshot()));
      }, 2000);

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

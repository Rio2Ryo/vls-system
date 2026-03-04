import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/* ─── In-memory chat store (per edge instance) ─── */

interface ChatMsg {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: "admin" | "user";
  text: string;
  targetUserId?: string;
  timestamp: number;
}

const MAX_MESSAGES = 200;
const messages: ChatMsg[] = [];
let msgSeq = 0;

/** SSE subscribers keyed by a unique subscriber id */
const subscribers = new Map<string, (msg: ChatMsg) => void>();

function broadcast(msg: ChatMsg) {
  subscribers.forEach((cb) => {
    try { cb(msg); } catch { /* subscriber closed */ }
  });
}

/**
 * POST /api/chat — Send a message
 * Body: { roomId, senderId, senderName, senderRole, text, targetUserId? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomId, senderId, senderName, senderRole, text, targetUserId } = body as {
      roomId: string;
      senderId: string;
      senderName: string;
      senderRole: "admin" | "user";
      text: string;
      targetUserId?: string;
    };

    if (!roomId || !senderId || !text?.trim()) {
      return NextResponse.json({ error: "roomId, senderId, text required" }, { status: 400 });
    }

    msgSeq++;
    const msg: ChatMsg = {
      id: `chat-${Date.now()}-${msgSeq}`,
      roomId,
      senderId,
      senderName: senderName || senderId,
      senderRole: senderRole || "user",
      text: text.trim(),
      targetUserId,
      timestamp: Date.now(),
    };

    messages.push(msg);
    // Trim old messages
    if (messages.length > MAX_MESSAGES) {
      messages.splice(0, messages.length - MAX_MESSAGES);
    }

    // Broadcast to SSE subscribers
    broadcast(msg);

    return NextResponse.json({ ok: true, message: msg });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

/**
 * GET /api/chat — SSE stream for real-time messages
 * Query: ?roomId=xxx (optional filter)
 */
export async function GET(req: NextRequest) {
  const roomFilter = req.nextUrl.searchParams.get("roomId") || null;
  const encoder = new TextEncoder();
  let alive = true;
  const subId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch { /* closed */ }
      };

      // Send recent messages for this room (last 50)
      const recent = roomFilter
        ? messages.filter((m) => m.roomId === roomFilter).slice(-50)
        : messages.slice(-50);
      send("init", JSON.stringify(recent));

      // Register subscriber
      subscribers.set(subId, (msg: ChatMsg) => {
        if (!alive) return;
        // Filter by room if specified
        if (roomFilter && msg.roomId !== roomFilter) return;
        send("message", JSON.stringify(msg));
      });

      // Heartbeat every 15s
      const heartbeatInterval = setInterval(() => {
        if (!alive) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch { /* closed */ }
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        alive = false;
        subscribers.delete(subId);
        clearInterval(heartbeatInterval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      alive = false;
      subscribers.delete(subId);
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

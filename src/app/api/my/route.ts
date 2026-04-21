import { NextRequest, NextResponse } from "next/server";
import { MyPortalSession } from "@/lib/types";

const KV_KEY = "vls_my_sessions";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vls-system.vercel.app";

/**
 * POST — Generate magic link and send via email.
 * Request: { email: string }
 */
export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email } = body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const token = crypto.randomUUID();
  const now = Date.now();
  const session: MyPortalSession = {
    id: `myp-${now}-${Math.random().toString(36).slice(2, 6)}`,
    email,
    token,
    createdAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  // Save session to D1 KV
  try {
    const existingRes = await fetch(new URL(`/api/db?key=${KV_KEY}`, req.url));
    let sessions: MyPortalSession[] = [];
    if (existingRes.ok) {
      const data = await existingRes.json();
      if (data.value) {
        sessions = JSON.parse(data.value);
      }
    }
    // Remove expired sessions on write
    sessions = sessions.filter((s) => s.expiresAt > now);
    sessions.push(session);

    await fetch(new URL("/api/db", req.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: KV_KEY, value: JSON.stringify(sessions) }),
    });
  } catch {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  // Send magic link email via Resend
  const portalUrl = `${APP_URL}/my/${token}`;

  if (RESEND_API_KEY && !RESEND_API_KEY.startsWith("re_placeholder")) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "みらい発見ラボ <noreply@miraihakkenlab.com>",
          to: [email],
          subject: "マイページログインリンク｜みらい発見ラボ",
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #333;">マイページへようこそ</h2>
              <p>以下のリンクからマイページにアクセスできます。</p>
              <p>過去に参加したイベントの写真を確認・再ダウンロードできます。</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${portalUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6EC6FF, #a78bfa); color: white; text-decoration: none; border-radius: 12px; font-weight: bold;">
                  マイページを開く
                </a>
              </div>
              <p style="color: #999; font-size: 12px;">このリンクの有効期限: ${new Date(session.expiresAt).toLocaleDateString("ja-JP")}（7日間）</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="color: #bbb; font-size: 11px;">みらい発見ラボ — イベント写真サービス</p>
            </div>
          `,
        }),
      });
    } catch {
      // Email send failed — token still works via direct URL access
    }
  }

  return NextResponse.json({ success: true });
}

/**
 * GET — Validate token and return aggregated participant data.
 * Query: ?token=xxx
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  // 1. Validate token from sessions
  let session: MyPortalSession | null = null;
  try {
    const dbRes = await fetch(new URL(`/api/db?key=${KV_KEY}`, req.url));
    if (!dbRes.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const data = await dbRes.json();
    if (!data.value) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const sessions: MyPortalSession[] = JSON.parse(data.value);
    session = sessions.find((s) => s.token === token) || null;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  if (session.expiresAt < Date.now()) {
    return NextResponse.json({ error: "Token expired" }, { status: 410 });
  }

  const email = session.email;

  // 2. Fetch download requests for this email
  interface DownloadRecord {
    eventId: string;
    photoIds: string[];
    email: string;
    sentAt: number;
  }
  let downloadRequests: DownloadRecord[] = [];
  try {
    const dlRes = await fetch(new URL("/api/db?key=vls_download_requests", req.url));
    if (dlRes.ok) {
      const dlData = await dlRes.json();
      if (dlData.value) {
        const allRequests: DownloadRecord[] = JSON.parse(dlData.value);
        downloadRequests = allRequests.filter(
          (r) => r.email?.toLowerCase() === email.toLowerCase()
        );
      }
    }
  } catch {
    // Continue without download data
  }

  // 3. Fetch participants for this email
  interface ParticipantRecord {
    eventId: string;
    email?: string;
    name: string;
  }
  let participants: ParticipantRecord[] = [];
  try {
    const pRes = await fetch(new URL("/api/db?key=vls_participants", req.url));
    if (pRes.ok) {
      const pData = await pRes.json();
      if (pData.value) {
        const allParticipants: ParticipantRecord[] = JSON.parse(pData.value);
        participants = allParticipants.filter(
          (p) => p.email?.toLowerCase() === email.toLowerCase()
        );
      }
    }
  } catch {
    // Continue without participant data
  }

  // 4. Fetch events for name/date resolution
  interface EventRecord {
    id: string;
    name: string;
    date: string;
    photos: { id: string; thumbnailUrl: string; originalUrl: string }[];
  }
  let events: EventRecord[] = [];
  try {
    const eRes = await fetch(new URL("/api/db?key=vls_admin_events", req.url));
    if (eRes.ok) {
      const eData = await eRes.json();
      if (eData.value) {
        events = JSON.parse(eData.value);
      }
    }
  } catch {
    // Continue without event data
  }

  // 5. Build aggregated response
  // Collect unique eventIds from both download requests and participant records
  const eventIdSet = new Set<string>();
  downloadRequests.forEach((r) => eventIdSet.add(r.eventId));
  participants.forEach((p) => eventIdSet.add(p.eventId));

  const eventMap = new Map(events.map((e) => [e.id, e]));

  const result = Array.from(eventIdSet).map((eventId) => {
    const event = eventMap.get(eventId);
    const dlRecords = downloadRequests.filter((r) => r.eventId === eventId);
    // Merge all photoIds from download requests
    const photoIdSet = new Set<string>();
    dlRecords.forEach((r) => r.photoIds?.forEach((pid) => photoIdSet.add(pid)));
    const latestDl = dlRecords.length > 0
      ? Math.max(...dlRecords.map((r) => r.sentAt || 0))
      : null;

    // Resolve photo thumbnails/originals from event data
    const photoDetails = event
      ? event.photos
          .filter((p) => photoIdSet.has(p.id))
          .map((p) => ({ id: p.id, thumbnailUrl: p.thumbnailUrl, originalUrl: p.originalUrl }))
      : [];

    return {
      eventId,
      eventName: event?.name || "不明なイベント",
      date: event?.date || "",
      photoCount: photoIdSet.size,
      photos: photoDetails,
      downloadedAt: latestDl,
    };
  });

  // Sort by date descending
  result.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return NextResponse.json({
    email,
    expiresAt: session.expiresAt,
    events: result,
  });
}

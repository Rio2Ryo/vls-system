import { NextRequest, NextResponse } from "next/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vls-system.vercel.app";

interface DownloadRequest {
  name: string;
  email: string;
  selectedPhotoIds: string[];
  eventId: string;
  eventName?: string;
}

/**
 * Store download request in localStorage-backed D1 KV store
 * and send email with download link via Resend.
 */
export async function POST(req: NextRequest) {
  let body: DownloadRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, selectedPhotoIds, eventId, eventName } = body;
  if (!name || !email || !eventId || !selectedPhotoIds?.length) {
    return NextResponse.json({ error: "name, email, eventId, selectedPhotoIds required" }, { status: 400 });
  }

  // Simple email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // Generate token and expiry (7 days)
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  // Store in D1 via /api/db
  const record = {
    id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    eventId,
    photoIds: selectedPhotoIds,
    name,
    email,
    token,
    expiresAt,
    sentAt: Date.now(),
    createdAt: Date.now(),
  };

  // Save to D1 KV (download_requests key)
  try {
    const existingRes = await fetch(new URL("/api/db?key=vls_download_requests", req.url));
    let requests: typeof record[] = [];
    if (existingRes.ok) {
      const data = await existingRes.json();
      if (data.value) {
        requests = JSON.parse(data.value);
      }
    }
    requests.push(record);

    await fetch(new URL("/api/db", req.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "vls_download_requests", value: JSON.stringify(requests) }),
    });
  } catch {
    // D1 save failed — continue with email anyway
  }

  // Send email via Resend
  const dlUrl = `${APP_URL}/dl/${token}`;
  const evtLabel = eventName || "イベント";

  if (RESEND_API_KEY && !RESEND_API_KEY.startsWith("re_placeholder")) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "未来発見ラボ <noreply@resend.dev>",
          to: [email],
          subject: `${name}様の写真ダウンロードリンクをお届けします｜未来発見ラボ`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #333;">${name}様</h2>
              <p>先日の${evtLabel}にご参加いただきありがとうございました。</p>
              <p>以下のリンクから<strong>7日以内</strong>に写真をダウンロードしてください。</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${dlUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6EC6FF, #a78bfa); color: white; text-decoration: none; border-radius: 12px; font-weight: bold;">
                  写真をダウンロード
                </a>
              </div>
              <p style="color: #999; font-size: 12px;">このリンクの有効期限: ${new Date(expiresAt).toLocaleDateString("ja-JP")}</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="color: #bbb; font-size: 11px;">未来発見ラボ — イベント写真サービス</p>
            </div>
          `,
        }),
      });
    } catch {
      // Email send failed — link still works via token
    }
  }

  return NextResponse.json({ success: true, token, expiresAt });
}

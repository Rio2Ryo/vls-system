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

export async function POST(req: NextRequest) {
  let body: DownloadRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, selectedPhotoIds, eventName } = body;
  if (!name || !email || !selectedPhotoIds?.length) {
    return NextResponse.json({ error: "name, email, selectedPhotoIds required" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const evtLabel = eventName || "イベント";

  // Build download page URL with all photo IDs
  const photosParam = selectedPhotoIds.map(id => encodeURIComponent(id)).join(",");
  const dlPageUrl = `${APP_URL}/dl?photos=${photosParam}${body.eventId ? `&event=${encodeURIComponent(body.eventId)}` : ""}`;

  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  if (RESEND_API_KEY && !RESEND_API_KEY.startsWith("re_placeholder")) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "未来開発ラボ <onboarding@resend.dev>",
          to: [email],
          subject: `${name}様の写真ダウンロードリンクをお届けします｜未来開発ラボ`,
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #1a1a2e; margin-bottom: 4px;">${name}様</h2>
              </div>
              <p style="color: #333; font-size: 14px;">先日の<strong>${evtLabel}</strong>にご参加いただきありがとうございました。</p>
              <p style="color: #333; font-size: 14px;">以下のボタンから${selectedPhotoIds.length}枚の写真をフレーム付きでダウンロードできます。</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${dlPageUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #6EC6FF, #a78bfa); color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 16px;">
                  📸 写真をダウンロード（${selectedPhotoIds.length}枚）
                </a>
              </div>

              <p style="color: #999; font-size: 12px; text-align: center;">
                ※ ボタンをクリックするとダウンロードページが開きます。スポンサー提供のフレーム付きで写真がダウンロードされます。
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="color: #bbb; font-size: 11px; text-align: center;">未来開発ラボ — イベント写真サービス</p>
            </div>
          `,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error("Resend API error:", res.status, errBody);
        return NextResponse.json({ error: "Email send failed" }, { status: 500 });
      }
    } catch (e) {
      console.error("Email send error:", e);
      return NextResponse.json({ error: "Email send failed" }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
  }

  return NextResponse.json({ success: true, expiresAt });
}

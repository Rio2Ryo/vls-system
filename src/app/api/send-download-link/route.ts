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

  // Build individual download links for each photo
  const photoLinks = selectedPhotoIds.map((id: string, i: number) => {
    const url = `${APP_URL}/api/proxy/images/${encodeURIComponent(id)}`;
    return `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
          <a href="${url}" style="color: #6366f1; text-decoration: none; font-size: 14px;">
            📷 写真 ${i + 1}
          </a>
        </td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">
          <a href="${url}" download style="display: inline-block; padding: 6px 16px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-size: 12px;">
            ダウンロード
          </a>
        </td>
      </tr>
    `;
  }).join("");

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
              <p style="color: #333; font-size: 14px;">以下のリンクから写真をダウンロードしてください。</p>
              
              <div style="background: #fafafa; border-radius: 12px; padding: 16px; margin: 24px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  ${photoLinks}
                </table>
              </div>

              <p style="color: #999; font-size: 12px; text-align: center;">
                ※ 各リンクをクリックすると写真が開きます。右クリック→「名前を付けて保存」でダウンロードできます。
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

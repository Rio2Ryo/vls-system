import { NextRequest, NextResponse } from "next/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vls-system.vercel.app";

/**
 * POST /api/send-registration-confirm
 * Send a registration confirmation email with personal QR code.
 * Body: { email, name, phone?, eventName, eventDate, eventVenue, checkinToken }
 */
export async function POST(req: NextRequest) {
  let body: {
    email?: string;
    name?: string;
    phone?: string;
    eventName?: string;
    eventDate?: string;
    eventVenue?: string;
    checkinToken?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, name, eventName, eventDate, eventVenue, checkinToken } = body;
  if (!email || !name || !checkinToken) {
    return NextResponse.json({ error: "email, name, checkinToken required" }, { status: 400 });
  }

  if (!RESEND_API_KEY || RESEND_API_KEY.startsWith("re_placeholder")) {
    console.warn("[send-registration-confirm] Email not configured, skipping");
    return NextResponse.json({ error: "Email not configured" }, { status: 500 });
  }

  const checkinUrl = `${APP_URL}/checkin/${checkinToken}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(checkinUrl)}`;

  // Format date for display
  let dateDisplay = eventDate || "";
  if (eventDate) {
    try {
      const d = new Date(eventDate + "T00:00:00");
      dateDisplay = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    } catch {
      dateDisplay = eventDate;
    }
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "みらい発見ラボ <noreply@miraihakkenlab.com>",
        to: [email],
        subject: `申し込み完了｜${eventName || "イベント"}`,
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #10b981, #14b8a6); padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: #fff; font-size: 20px; margin: 0;">✅ 申し込み完了</h1>
            </div>

            <!-- Body -->
            <div style="background: #fff; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none;">
              <p style="color: #333; font-size: 16px; margin: 0 0 16px;">${name} さん</p>
              <p style="color: #555; font-size: 14px; margin: 0 0 24px;">
                イベントへの申し込みが完了しました。ありがとうございます！
              </p>

              <!-- Event details -->
              <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 24px;">
                <p style="color: #333; font-size: 15px; font-weight: bold; margin: 0 0 8px;">
                  🎪 ${eventName || "イベント"}
                </p>
                ${dateDisplay ? `<p style="color: #666; font-size: 13px; margin: 0 0 4px;">📅 ${dateDisplay}</p>` : ""}
                ${eventVenue ? `<p style="color: #666; font-size: 13px; margin: 0;">📍 ${eventVenue}</p>` : ""}
              </div>

              <!-- QR Code -->
              <div style="text-align: center; margin: 24px 0;">
                <p style="color: #333; font-size: 14px; font-weight: bold; margin: 0 0 12px;">
                  チェックイン用QRコード
                </p>
                <img src="${qrImageUrl}" alt="チェックイン用QRコード" width="200" height="200"
                  style="width: 200px; height: 200px; border: 1px solid #e5e7eb; border-radius: 8px;" />
                <p style="color: #999; font-size: 11px; margin: 8px 0 0;">
                  会場でこのQRコードを提示してチェックインしてください
                </p>
              </div>

              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

              <p style="color: #aaa; font-size: 11px; margin: 0; text-align: center;">
                このQRコードはあなた専用です。他の方と共有しないでください。
              </p>
            </div>

            <!-- Footer -->
            <div style="background: #f3f4f6; padding: 16px 24px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
              <p style="color: #bbb; font-size: 11px; margin: 0;">みらい発見ラボ — イベント写真サービス</p>
            </div>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[send-registration-confirm] Resend error:", err);
      return NextResponse.json({ error: "Email send failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-registration-confirm] Error:", err);
    return NextResponse.json({ error: "Email send failed" }, { status: 500 });
  }
}

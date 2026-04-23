import { NextRequest, NextResponse } from "next/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vls-system.vercel.app";

/**
 * POST /api/send-checkin-qr
 * Send a personal QR code check-in email to a participant.
 * Body: { email, name, token, eventName }
 */
export async function POST(req: NextRequest) {
  let body: { email?: string; name?: string; token?: string; eventName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, name, token, eventName } = body;
  if (!email || !name || !token) {
    return NextResponse.json({ error: "email, name, token required" }, { status: 400 });
  }

  if (!RESEND_API_KEY || RESEND_API_KEY.startsWith("re_placeholder")) {
    return NextResponse.json({ error: "Email not configured" }, { status: 500 });
  }

  const checkinUrl = `${APP_URL}/checkin/${token}`;

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
        subject: `チェックイン用QRコード｜${eventName || "イベント"}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">${name} さん</h2>
            <p>イベント「<strong>${eventName || ""}</strong>」のチェックイン用QRコードです。</p>
            <p>会場のスキャナーにQRコードをかざすか、下のボタンからチェックインしてください。</p>
            <div style="text-align: center; margin: 30px 0;">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkinUrl)}" alt="QR Code" style="width: 200px; height: 200px;" />
            </div>
            <div style="text-align: center; margin: 20px 0;">
              <a href="${checkinUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #22c55e, #16a34a); color: white; text-decoration: none; border-radius: 12px; font-weight: bold;">
                チェックインする
              </a>
            </div>
            <p style="color: #999; font-size: 12px;">このQRコードはあなた専用です。他の方と共有しないでください。</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #bbb; font-size: 11px;">みらい発見ラボ — イベント写真サービス</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[send-checkin-qr] Resend error:", err);
      return NextResponse.json({ error: "Email send failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-checkin-qr] Error:", err);
    return NextResponse.json({ error: "Email send failed" }, { status: 500 });
  }
}

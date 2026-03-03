import { NextRequest, NextResponse } from "next/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vls-system.vercel.app";

interface SendNpsRequest {
  eventId: string;
  eventName: string;
  participants: { name: string; email: string }[];
}

/**
 * POST /api/send-nps — Send NPS follow-up emails for an event.
 * Creates NPS records (pending) and sends emails via Resend.
 */
export async function POST(req: NextRequest) {
  let body: SendNpsRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { eventId, eventName, participants } = body;
  if (!eventId || !eventName || !participants?.length) {
    return NextResponse.json({ error: "eventId, eventName, participants required" }, { status: 400 });
  }

  // Fetch existing NPS data
  let responses: Array<Record<string, unknown>> = [];
  try {
    const dbRes = await fetch(new URL("/api/db?key=vls_nps_responses", req.url));
    if (dbRes.ok) {
      const data = await dbRes.json();
      if (data.value) responses = JSON.parse(data.value);
    }
  } catch {
    // Continue with empty
  }

  const newRecords: Array<Record<string, unknown>> = [];
  let sentCount = 0;

  for (const p of participants) {
    if (!p.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) continue;

    const token = crypto.randomUUID();
    const now = Date.now();

    const record = {
      id: `nps-${now}-${Math.random().toString(36).slice(2, 6)}`,
      eventId,
      eventName,
      participantName: p.name || "参加者",
      participantEmail: p.email,
      token,
      sentAt: now,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    newRecords.push(record);

    // Send email via Resend
    if (RESEND_API_KEY && !RESEND_API_KEY.startsWith("re_placeholder")) {
      const npsUrl = `${APP_URL}/survey-nps/${token}`;
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "未来発見ラボ <noreply@resend.dev>",
            to: [p.email],
            subject: `${p.name || "参加者"}様へ — ${eventName}のご感想をお聞かせください`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #333;">${p.name || "参加者"}様</h2>
                <p>先日の<strong>${eventName}</strong>にご参加いただきありがとうございました。</p>
                <p>今後のイベント改善のため、簡単なアンケートにご協力ください（1分で完了）。</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${npsUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6EC6FF, #a78bfa); color: white; text-decoration: none; border-radius: 12px; font-weight: bold;">
                    アンケートに回答する
                  </a>
                </div>
                <p style="color: #999; font-size: 12px;">回答期限: ${new Date(record.expiresAt).toLocaleDateString("ja-JP")}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="color: #bbb; font-size: 11px;">未来発見ラボ — イベント写真サービス</p>
              </div>
            `,
          }),
        });
        sentCount++;
      } catch {
        // Email failed — record still created for manual follow-up
      }
    } else {
      sentCount++; // Count as "sent" in demo mode
    }
  }

  // Save all new records to D1
  try {
    const allResponses = [...responses, ...newRecords];
    await fetch(new URL("/api/db", req.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "vls_nps_responses", value: JSON.stringify(allResponses) }),
    });
  } catch {
    // D1 save failed
  }

  return NextResponse.json({
    success: true,
    sent: sentCount,
    total: newRecords.length,
  });
}

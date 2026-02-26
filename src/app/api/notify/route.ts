import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

interface NotifyPayload {
  to: string;
  eventName: string;
  type: "registration" | "cm_complete";
  participantName?: string;
  companyName?: string;
}

/**
 * POST /api/notify
 * Send email notification via MailChannels (free on Cloudflare/Vercel Edge).
 * Falls back to console.log if MailChannels is unavailable.
 */
export async function POST(request: NextRequest) {
  try {
    const body: NotifyPayload = await request.json();
    const { to, eventName, type, participantName, companyName } = body;

    if (!to || !eventName || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const subject = type === "registration"
      ? `[VLS] ${eventName} - 新規参加者: ${participantName || "匿名"}`
      : `[VLS] ${eventName} - CM視聴完了: ${participantName || "匿名"}`;

    const htmlContent = type === "registration"
      ? `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6EC6FF;">VLS イベント通知</h2>
          <p>イベント「<b>${eventName}</b>」に新しい参加者がアクセスしました。</p>
          <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #888;">参加者名</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>${participantName || "匿名"}</b></td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #888;">イベント</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${eventName}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #888;">ステータス</td><td style="padding: 8px; border-bottom: 1px solid #eee;">アンケート完了・CM視聴開始</td></tr>
          </table>
          <p style="color: #888; font-size: 12px; margin-top: 20px;">VLS System - Event Photo Service</p>
        </div>`
      : `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6EC6FF;">VLS CM視聴完了通知</h2>
          <p>イベント「<b>${eventName}</b>」で参加者がCM視聴を完了しました。</p>
          <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #888;">参加者名</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>${participantName || "匿名"}</b></td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #888;">視聴企業</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${companyName || "—"}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #888;">イベント</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${eventName}</td></tr>
          </table>
          <p style="color: #888; font-size: 12px; margin-top: 20px;">VLS System - Event Photo Service</p>
        </div>`;

    // Try SendGrid first (if API key is configured)
    const sendgridKey = process.env.SENDGRID_API_KEY;
    if (sendgridKey) {
      try {
        const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sendgridKey}`,
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: process.env.SENDGRID_FROM_EMAIL || "noreply@vls-system.vercel.app", name: "VLS System" },
            subject,
            content: [{ type: "text/html", value: htmlContent }],
          }),
        });

        if (sgRes.ok || sgRes.status === 202) {
          return NextResponse.json({ success: true, method: "sendgrid" });
        }
        console.log(`SendGrid returned ${sgRes.status}, trying MailChannels fallback`);
      } catch (sgErr) {
        console.log("SendGrid failed, trying MailChannels fallback:", sgErr);
      }
    }

    // Try MailChannels API (free, no API key needed)
    try {
      const mailRes = await fetch("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: "noreply@vls-system.vercel.app", name: "VLS System" },
          subject,
          content: [{ type: "text/html", value: htmlContent }],
        }),
      });

      if (mailRes.ok || mailRes.status === 202) {
        return NextResponse.json({ success: true, method: "mailchannels" });
      }

      // MailChannels may not be available outside Cloudflare Workers
      console.log(`MailChannels returned ${mailRes.status}, logging notification instead`);
    } catch (mailErr) {
      console.log("MailChannels not available, logging notification:", mailErr);
    }

    // Fallback: log the notification (for environments where neither is available)
    console.log(`[NOTIFY] ${subject} → ${to}`);
    return NextResponse.json({ success: true, method: "logged", subject });
  } catch (error) {
    console.error("Notify error:", error);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}

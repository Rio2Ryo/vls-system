import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { logError } from "@/lib/errorLog";

export const runtime = "nodejs";

interface NotifyPayload {
  to: string;
  eventName: string;
  type: "registration" | "cm_complete" | "license_expiry";
  participantName?: string;
  companyName?: string;
  daysLeft?: number;
  tenantName?: string;
  tenantId?: string;
  licenseEnd?: string;
  brandColor?: string;
}

/** Check if an API key looks like a real key (not a placeholder). */
function isRealKey(key: string | undefined): key is string {
  if (!key) return false;
  const lower = key.toLowerCase();
  if (lower.includes("placeholder") || lower.includes("your_") || lower.includes("xxx") || lower === "") return false;
  return true;
}

/** Wrap email body content in a branded HTML shell. */
function wrapHtml(body: string, accent: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <!-- accent bar -->
  <tr><td style="height:4px;background-color:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
  <!-- logo -->
  <tr><td style="padding:28px 32px 12px 32px;text-align:center;">
    <span style="font-size:32px;font-weight:700;letter-spacing:2px;color:${accent};">VLS</span>
    <span style="display:block;font-size:11px;color:#999;margin-top:2px;">Video Learning System</span>
  </td></tr>
  <!-- body -->
  <tr><td style="padding:8px 32px 28px 32px;">${body}</td></tr>
  <!-- footer -->
  <tr><td style="background-color:#fafafa;padding:20px 32px;border-top:1px solid #eee;text-align:center;">
    <p style="margin:0 0 4px 0;font-size:11px;color:#999;">&copy; ${new Date().getFullYear()} VLS System — Event Photo Service</p>
    <p style="margin:0;font-size:11px;color:#bbb;">このメールはシステムから自動送信されています。</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Build a styled data table row. */
function tableRow(label: string, value: string, isLast = false): string {
  const border = isLast ? "none" : "1px solid #eee";
  return `<tr>
  <td style="padding:10px 12px;border-bottom:${border};color:#888;font-size:13px;width:35%;vertical-align:top;">${label}</td>
  <td style="padding:10px 12px;border-bottom:${border};font-size:14px;color:#333;">${value}</td>
</tr>`;
}

function buildEmail(payload: NotifyPayload): { subject: string; html: string } {
  const { eventName, type, participantName, companyName, daysLeft, tenantName, licenseEnd, brandColor } = payload;
  const accent = brandColor || "#6EC6FF";

  const subject = type === "registration"
    ? `[VLS] ${eventName} - 新規参加者: ${participantName || "匿名"}`
    : type === "license_expiry"
      ? `[VLS] ライセンス期限通知: ${tenantName || eventName} (残り${daysLeft || 0}日)`
      : `[VLS] ${eventName} - CM視聴完了: ${participantName || "匿名"}`;

  const tableStyle = 'style="border-collapse:collapse;width:100%;margin:16px 0;"';

  let body: string;

  if (type === "registration") {
    body = `
      <h2 style="color:${accent};font-size:20px;margin:0 0 12px 0;">イベント通知</h2>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px 0;">
        イベント「<b style="color:#333;">${eventName}</b>」に新しい参加者がアクセスしました。
      </p>
      <table ${tableStyle}>
        ${tableRow("参加者名", `<b>${participantName || "匿名"}</b>`)}
        ${tableRow("イベント", eventName)}
        ${tableRow("ステータス", `<span style="color:${accent};font-weight:600;">アンケート完了・CM視聴開始</span>`, true)}
      </table>`;
  } else if (type === "license_expiry") {
    const warningColor = "#F59E0B";
    const urgentColor = (daysLeft ?? 0) <= 7 ? "#EF4444" : warningColor;
    body = `
      <h2 style="color:${warningColor};font-size:20px;margin:0 0 12px 0;">ライセンス期限通知</h2>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px 0;">
        「<b style="color:#333;">${tenantName || eventName}</b>」のライセンスがまもなく期限を迎えます。
      </p>
      <table ${tableStyle}>
        ${tableRow("組織名", `<b>${tenantName || eventName}</b>`)}
        ${tableRow("ライセンス期限", licenseEnd || "—")}
        ${tableRow("残り日数", `<b style="color:${urgentColor};font-size:16px;">${daysLeft || 0}日</b>`, true)}
      </table>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:16px 0 0 0;">ライセンスの更新手続きをお願いいたします。</p>`;
  } else {
    body = `
      <h2 style="color:${accent};font-size:20px;margin:0 0 12px 0;">CM視聴完了通知</h2>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px 0;">
        イベント「<b style="color:#333;">${eventName}</b>」で参加者がCM視聴を完了しました。
      </p>
      <table ${tableStyle}>
        ${tableRow("参加者名", `<b>${participantName || "匿名"}</b>`)}
        ${tableRow("視聴企業", companyName || "—")}
        ${tableRow("イベント", eventName, true)}
      </table>`;
  }

  return { subject, html: wrapHtml(body, accent) };
}

/**
 * GET /api/notify
 * Return email provider configuration status (no secrets exposed).
 */
export async function GET() {
  const resendKey = process.env.RESEND_API_KEY;
  const sendgridKey = process.env.SENDGRID_API_KEY;

  return NextResponse.json({
    providers: {
      resend: {
        configured: isRealKey(resendKey),
        keyPrefix: resendKey ? resendKey.slice(0, 6) + "..." : null,
      },
      sendgrid: {
        configured: isRealKey(sendgridKey),
        keyPrefix: sendgridKey ? sendgridKey.slice(0, 6) + "..." : null,
      },
    },
    fromAddress: process.env.EMAIL_FROM || "VLS System <onboarding@resend.dev>",
    activeProvider: isRealKey(resendKey) ? "resend" : isRealKey(sendgridKey) ? "sendgrid" : null,
  });
}

/**
 * POST /api/notify
 * Send email notification.
 * Priority: Resend → SendGrid → console.log fallback.
 * Returns provider-specific error details for debugging.
 */
export async function POST(request: NextRequest) {
  try {
    const body: NotifyPayload = await request.json();
    const { to, eventName, type } = body;

    if (!to || !eventName || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { subject, html } = buildEmail(body);
    const fromAddress = process.env.EMAIL_FROM || "VLS System <onboarding@resend.dev>";

    const errors: { provider: string; error: string }[] = [];

    // 1. Try Resend (primary)
    const resendKey = process.env.RESEND_API_KEY;
    if (isRealKey(resendKey)) {
      try {
        const resend = new Resend(resendKey);
        const { data, error } = await resend.emails.send({
          from: fromAddress,
          to: [to],
          subject,
          html,
        });
        if (!error && data) {
          return NextResponse.json({ success: true, method: "resend", status: "sent" });
        }
        const errMsg = error?.message || "Unknown Resend error";
        console.error("Resend error:", errMsg);
        errors.push({ provider: "resend", error: errMsg });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("Resend exception:", errMsg);
        errors.push({ provider: "resend", error: errMsg });
      }
    }

    // 2. Try SendGrid (fallback)
    const sendgridKey = process.env.SENDGRID_API_KEY;
    if (isRealKey(sendgridKey)) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
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
            content: [{ type: "text/html", value: html }],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (sgRes.ok || sgRes.status === 202) {
          return NextResponse.json({ success: true, method: "sendgrid", status: "sent" });
        }
        let errMsg = `HTTP ${sgRes.status}`;
        try {
          const sgBody = await sgRes.json();
          if (sgBody?.errors?.[0]?.message) errMsg += `: ${sgBody.errors[0].message}`;
        } catch { /* ignore parse error */ }
        console.error(`SendGrid error: ${errMsg}`);
        errors.push({ provider: "sendgrid", error: errMsg });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("SendGrid exception:", errMsg);
        errors.push({ provider: "sendgrid", error: errMsg });
      }
    }

    // 3. Fallback: log only
    console.log(`[NOTIFY] ${subject} → ${to}`);

    const hasProviders = isRealKey(resendKey) || isRealKey(sendgridKey);
    return NextResponse.json({
      success: true,
      method: "logged",
      status: "logged",
      subject,
      note: !hasProviders
        ? "メールプロバイダーが未設定です。RESEND_API_KEY または SENDGRID_API_KEY を設定してください。"
        : "全てのメールプロバイダーで送信に失敗しました。サーバーログを確認してください。",
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logError({ route: "/api/notify", error });
    return NextResponse.json({
      error: "Failed to send notification",
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

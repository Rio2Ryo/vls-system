import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { logError } from "@/lib/errorLog";

export const runtime = "nodejs";

function isRealKey(key: string | undefined): key is string {
  if (!key) return false;
  const lower = key.toLowerCase();
  if (lower.includes("placeholder") || lower.includes("your_") || lower.includes("xxx") || lower === "") return false;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, eventNames, reportBase64 } = body as {
      email?: string;
      eventNames?: string[];
      reportBase64?: string;
    };

    if (!email || !reportBase64) {
      return NextResponse.json({ error: "email and reportBase64 are required" }, { status: 400 });
    }

    // Extract raw base64 from data URI
    const base64Data = reportBase64.includes(",")
      ? reportBase64.split(",")[1]
      : reportBase64;

    const eventListText = (eventNames && eventNames.length > 0)
      ? eventNames.join("\u30FB")
      : "\u8907\u6570\u30A4\u30D9\u30F3\u30C8";

    const subject = `\u3010VLS\u3011\u30A4\u30D9\u30F3\u30C8\u6BD4\u8F03\u30EC\u30DD\u30FC\u30C8 \u2014 ${eventListText}`;
    const dateStr = new Date().toLocaleDateString("ja", { year: "numeric", month: "long", day: "numeric" });

    // Build email body HTML
    const bodyHtml = `
      <div style="font-family:'Hiragino Sans','Meiryo',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#333;">
        <div style="text-align:center;margin-bottom:20px;">
          <span style="font-size:28px;font-weight:700;color:#6EC6FF;">VLS</span>
          <p style="font-size:11px;color:#999;margin:4px 0 0;">Video Learning System</p>
        </div>
        <div style="background:#f8f8fc;border-radius:8px;padding:20px;margin-bottom:20px;">
          <h2 style="font-size:16px;margin:0 0 8px;color:#222;">\u30A4\u30D9\u30F3\u30C8\u6BD4\u8F03\u30EC\u30DD\u30FC\u30C8</h2>
          <p style="font-size:12px;color:#666;margin:0;">\u767A\u884C\u65E5: ${dateStr}</p>
          <p style="font-size:12px;color:#666;margin:4px 0 0;">\u6BD4\u8F03\u5BFE\u8C61: ${eventListText}</p>
        </div>
        <p style="font-size:13px;color:#555;line-height:1.8;">
          \u6DFB\u4ED8\u306EPDF\u30D5\u30A1\u30A4\u30EB\u306B\u30A4\u30D9\u30F3\u30C8\u6BD4\u8F03\u30EC\u30DD\u30FC\u30C8\u3092\u6DFB\u4ED8\u3057\u307E\u3057\u305F\u3002<br/>
          \u53C2\u52A0\u7387\u30FBCM\u8996\u8074\u7387\u30FBDL\u7387\u30FBNPS\u30B9\u30B3\u30A2\u306E\u6A2A\u65AD\u6BD4\u8F03\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002
        </p>
        <div style="border-top:1px solid #eee;padding-top:16px;margin-top:24px;text-align:center;">
          <p style="font-size:10px;color:#bbb;">&copy; ${new Date().getFullYear()} VLS System \u2014 Event Photo Service</p>
          <p style="font-size:10px;color:#ccc;">\u3053\u306E\u30E1\u30FC\u30EB\u306F\u30B7\u30B9\u30C6\u30E0\u304B\u3089\u81EA\u52D5\u9001\u4FE1\u3055\u308C\u3066\u3044\u307E\u3059\u3002</p>
        </div>
      </div>
    `;

    const RESEND_KEY = process.env.RESEND_API_KEY;
    const SENDGRID_KEY = process.env.SENDGRID_API_KEY;

    // Try Resend first
    if (isRealKey(RESEND_KEY)) {
      const resend = new Resend(RESEND_KEY);
      const result = await resend.emails.send({
        from: "VLS System <onboarding@resend.dev>",
        to: email,
        subject,
        html: bodyHtml,
        attachments: [
          {
            filename: `event-compare-report-${new Date().toISOString().slice(0, 10)}.pdf`,
            content: base64Data,
          },
        ],
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      return NextResponse.json({ status: "sent", method: "resend" });
    }

    // Fallback: SendGrid
    if (isRealKey(SENDGRID_KEY)) {
      const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SENDGRID_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: "noreply@vls-system.com", name: "VLS System" },
          subject,
          content: [{ type: "text/html", value: bodyHtml }],
          attachments: [
            {
              content: base64Data,
              filename: `event-compare-report-${new Date().toISOString().slice(0, 10)}.pdf`,
              type: "application/pdf",
              disposition: "attachment",
            },
          ],
        }),
      });

      if (!sgRes.ok) {
        throw new Error(`SendGrid error: ${sgRes.status}`);
      }

      return NextResponse.json({ status: "sent", method: "sendgrid" });
    }

    // No email provider configured -- log only
    console.log(`[send-report] No email provider. Would send to: ${email}, subject: ${subject}`);
    return NextResponse.json({ status: "logged", method: "console" });

  } catch (err) {
    logError({ route: "/api/send-report", error: err });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}

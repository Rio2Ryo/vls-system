import { NextRequest, NextResponse } from "next/server";
import { isD1Configured, createResetToken, verifyResetToken, consumeResetToken, getUserAccountByEmail } from "@/lib/d1";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const APP_URL = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

/**
 * POST /api/auth/reset-password
 *
 * Two actions:
 *
 * 1. request — Generate reset token + send email
 *    Body: { action: "request", email }
 *
 * 2. reset — Verify token + update password (D1 user_accounts)
 *    Body: { action: "reset", token, newPassword }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  // ── request: generate token + send email ──
  if (action === "request") {
    const email = (body.email as string || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "有効なメールアドレスを入力してください" }, { status: 400 });
    }

    if (!isD1Configured()) {
      return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
    }

    // Check if user exists (don't reveal if email not found — always return success)
    const user = await getUserAccountByEmail(email);

    if (user) {
      const token = await createResetToken(email);
      const resetUrl = `${APP_URL}/reset-password?token=${token}`;

      // Send email via Resend
      if (RESEND_API_KEY && !RESEND_API_KEY.startsWith("re_placeholder")) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "VLS System <noreply@miraihakkenlab.com>",
              to: [email],
              subject: "パスワードリセットのご案内 | VLS System",
              html: `
                <div style="font-family: 'Noto Sans JP', sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
                  <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">パスワードリセット</h2>
                  <p style="color: #4a4a4a; font-size: 14px; line-height: 1.6;">
                    パスワードリセットのリクエストを受け付けました。<br>
                    以下のボタンをクリックして新しいパスワードを設定してください。
                  </p>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${resetUrl}"
                       style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #6EC6FF, #A78BFA); color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 14px;">
                      パスワードをリセット
                    </a>
                  </div>
                  <p style="color: #999; font-size: 12px; line-height: 1.5;">
                    このリンクは30分間有効です。<br>
                    心当たりがない場合は、このメールを無視してください。
                  </p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                  <p style="color: #ccc; font-size: 11px; text-align: center;">VLS System</p>
                </div>
              `,
            }),
          });
        } catch (err) {
          console.error("Failed to send reset email:", err);
        }
      } else {
        // Development: log the reset URL
        console.log(`[Reset Password] Token for ${email}: ${token}`);
        console.log(`[Reset Password] URL: ${resetUrl}`);
      }
    }

    // Always return success (don't leak whether email exists)
    return NextResponse.json({
      ok: true,
      message: "メールアドレスが登録されている場合、リセットリンクを送信しました",
    });
  }

  // ── reset: verify token + update password ──
  if (action === "reset") {
    const token = body.token as string;
    const newPassword = body.newPassword as string;

    if (!token || !newPassword) {
      return NextResponse.json({ error: "token and newPassword required" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "パスワードは6文字以上で設定してください" }, { status: 400 });
    }

    if (!isD1Configured()) {
      return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
    }

    const email = await verifyResetToken(token);
    if (!email) {
      return NextResponse.json({ error: "リセットリンクが無効または期限切れです" }, { status: 400 });
    }

    // Update user password in user_accounts (store hashed in production, plaintext for demo)
    const { d1Query: query } = await import("@/lib/d1");
    await query(
      "UPDATE user_accounts SET metadata = ? WHERE email = ?",
      [JSON.stringify({ password: newPassword, updatedAt: Date.now() }), email]
    );

    // Consume the token
    await consumeResetToken(token);

    return NextResponse.json({ ok: true, message: "パスワードを更新しました" });
  }

  // ── verify: check if token is still valid (for UI) ──
  if (action === "verify") {
    const token = body.token as string;
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    if (!isD1Configured()) {
      return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
    }
    const email = await verifyResetToken(token);
    return NextResponse.json({ valid: !!email, email: email ? email.replace(/(.{2}).*(@.*)/, "$1***$2") : null });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

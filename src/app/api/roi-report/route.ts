import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { logError } from "@/lib/errorLog";

export const runtime = "nodejs";

interface RoiReportPayload {
  email: string;
  companyId?: string;
  dateFrom?: string;
  dateTo?: string;
}

const CPV_RATES: Record<string, number> = {
  platinum: 50, gold: 35, silver: 20, bronze: 10,
};
const TIER_LABEL: Record<string, string> = {
  platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze",
};

function isRealKey(key: string | undefined): key is string {
  if (!key) return false;
  const lower = key.toLowerCase();
  if (lower.includes("placeholder") || lower.includes("your_") || lower.includes("xxx") || lower === "") return false;
  return true;
}

function wrapHtml(body: string, accent: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="height:4px;background-color:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:28px 32px 12px 32px;text-align:center;">
    <span style="font-size:32px;font-weight:700;letter-spacing:2px;color:${accent};">VLS</span>
    <span style="display:block;font-size:11px;color:#999;margin-top:2px;">Video Learning System — ROI Report</span>
  </td></tr>
  <tr><td style="padding:8px 32px 28px 32px;">${body}</td></tr>
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

function fmtYen(n: number): string { return `&yen;${n.toLocaleString()}`; }
function fmtPct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : "&mdash;";
}

interface CompanyData {
  id: string;
  name: string;
  tier: string;
  [key: string]: unknown;
}

interface VideoPlay {
  companyId: string;
  companyName: string;
  cmType: string;
  completed: boolean;
  watchedSeconds: number;
  duration: number;
  timestamp: number;
  eventId: string;
}

interface AnalyticsRec {
  stepsCompleted: { cmViewed: boolean; downloaded: boolean };
  timestamp: number;
  eventId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RoiReportPayload = await request.json();
    const { email, companyId, dateFrom, dateTo } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "有効なメールアドレスを入力してください" }, { status: 400 });
    }

    // Fetch data from D1 KV
    const baseUrl = request.nextUrl.origin;
    const dbRes = await fetch(`${baseUrl}/api/db`, {
      headers: { "x-admin-password": process.env.ADMIN_PASSWORD || "" },
    });
    const kvData = dbRes.ok ? await dbRes.json() as Record<string, string> : {};

    const allCompanies: CompanyData[] = kvData.vls_admin_companies ? JSON.parse(kvData.vls_admin_companies) : [];
    let videoPlays: VideoPlay[] = kvData.vls_video_plays ? JSON.parse(kvData.vls_video_plays) : [];
    let analyticsRecs: AnalyticsRec[] = kvData.vls_analytics ? JSON.parse(kvData.vls_analytics) : [];

    // Apply filters
    if (companyId) {
      videoPlays = videoPlays.filter((v) => v.companyId === companyId);
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      videoPlays = videoPlays.filter((v) => v.timestamp >= from);
      analyticsRecs = analyticsRecs.filter((a) => a.timestamp >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000;
      videoPlays = videoPlays.filter((v) => v.timestamp < to);
      analyticsRecs = analyticsRecs.filter((a) => a.timestamp < to);
    }

    // Calculate ROI stats
    const totalImpressions = videoPlays.length;
    const totalCompleted = videoPlays.filter((v) => v.completed).length;
    let totalCost = 0;
    for (const v of videoPlays) {
      if (v.completed) {
        const co = allCompanies.find((c) => c.id === v.companyId);
        totalCost += CPV_RATES[co?.tier || "bronze"] || 10;
      }
    }
    const avgCpv = totalCompleted > 0 ? Math.round(totalCost / totalCompleted) : 0;
    const cmViewedCount = analyticsRecs.filter((a) => a.stepsCompleted.cmViewed).length;
    const downloadedCount = analyticsRecs.filter((a) => a.stepsCompleted.downloaded).length;
    const cvr = cmViewedCount > 0 ? Math.round((downloadedCount / cmViewedCount) * 100) : 0;

    // Company breakdown
    const companyMap = new Map<string, { name: string; tier: string; plays: number; completed: number; cost: number }>();
    for (const v of videoPlays) {
      if (!companyMap.has(v.companyId)) {
        const co = allCompanies.find((c) => c.id === v.companyId);
        companyMap.set(v.companyId, { name: v.companyName, tier: co?.tier || "bronze", plays: 0, completed: 0, cost: 0 });
      }
      const entry = companyMap.get(v.companyId)!;
      entry.plays++;
      if (v.completed) {
        entry.completed++;
        entry.cost += CPV_RATES[entry.tier] || 10;
      }
    }

    // CM type breakdown
    const cmTypeStats = (["cm15", "cm30", "cm60"] as const).map((ct) => {
      const plays = videoPlays.filter((v) => v.cmType === ct);
      const completed = plays.filter((v) => v.completed).length;
      const avgWatch = plays.length > 0 ? Math.round(plays.reduce((s, v) => s + v.watchedSeconds, 0) / plays.length * 10) / 10 : 0;
      return { label: ct === "cm15" ? "15秒CM" : ct === "cm30" ? "30秒CM" : "60秒CM", plays: plays.length, completed, avgWatch };
    });

    // Build HTML
    const today = new Date().toLocaleDateString("ja", { year: "numeric", month: "long", day: "numeric" });
    const periodStr = dateFrom || dateTo ? `${dateFrom || "開始"} 〜 ${dateTo || "現在"}` : "全期間";

    const companyRows = Array.from(companyMap.values())
      .sort((a, b) => b.cost - a.cost)
      .map((c) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${c.name}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px;">${TIER_LABEL[c.tier] || c.tier}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px;">${c.plays}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px;">${fmtPct(c.completed, c.plays)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px;">${fmtYen(c.cost)}</td>
      </tr>`)
      .join("");

    const cmRows = cmTypeStats
      .filter((c) => c.plays > 0)
      .map((c) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${c.label}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px;">${c.plays}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px;">${fmtPct(c.completed, c.plays)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px;">${c.avgWatch}秒</td>
      </tr>`)
      .join("");

    const emailBody = `
      <h2 style="color:#6EC6FF;font-size:20px;margin:0 0 8px 0;">ROIレポート</h2>
      <p style="color:#888;font-size:12px;margin:0 0 16px 0;">発行日: ${today} | 対象期間: ${periodStr}</p>

      <div style="display:flex;gap:12px;margin-bottom:20px;">
        <div style="flex:1;background:#f8f8fc;border-radius:8px;padding:12px;text-align:center;">
          <p style="font-size:22px;font-weight:bold;margin:0;color:#6EC6FF;">${totalImpressions.toLocaleString()}</p>
          <p style="font-size:10px;color:#999;margin:2px 0 0;">総インプレッション</p>
        </div>
        <div style="flex:1;background:#f8f8fc;border-radius:8px;padding:12px;text-align:center;">
          <p style="font-size:22px;font-weight:bold;margin:0;color:#22C55E;">${fmtYen(avgCpv)}</p>
          <p style="font-size:10px;color:#999;margin:2px 0 0;">平均CPV</p>
        </div>
        <div style="flex:1;background:#f8f8fc;border-radius:8px;padding:12px;text-align:center;">
          <p style="font-size:22px;font-weight:bold;margin:0;color:#8B5CF6;">${cvr}%</p>
          <p style="font-size:10px;color:#999;margin:2px 0 0;">CVR</p>
        </div>
        <div style="flex:1;background:#f8f8fc;border-radius:8px;padding:12px;text-align:center;">
          <p style="font-size:22px;font-weight:bold;margin:0;color:#F97316;">${fmtYen(totalCost)}</p>
          <p style="font-size:10px;color:#999;margin:2px 0 0;">推定広告費</p>
        </div>
      </div>

      <h3 style="font-size:13px;color:#555;border-bottom:1px solid #eee;padding-bottom:6px;margin:16px 0 8px;">企業別パフォーマンス</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;">
        <thead>
          <tr style="background:#f0f0f5;">
            <th style="padding:6px 8px;text-align:left;">企業名</th>
            <th style="padding:6px 8px;text-align:center;">Tier</th>
            <th style="padding:6px 8px;text-align:center;">再生数</th>
            <th style="padding:6px 8px;text-align:center;">完了率</th>
            <th style="padding:6px 8px;text-align:center;">推定費用</th>
          </tr>
        </thead>
        <tbody>${companyRows || '<tr><td colspan="5" style="padding:8px;text-align:center;color:#999;">データなし</td></tr>'}</tbody>
      </table>

      <h3 style="font-size:13px;color:#555;border-bottom:1px solid #eee;padding-bottom:6px;margin:16px 0 8px;">CM尺別A/B比較</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;">
        <thead>
          <tr style="background:#f0f0f5;">
            <th style="padding:6px 8px;text-align:left;">CM尺</th>
            <th style="padding:6px 8px;text-align:center;">再生数</th>
            <th style="padding:6px 8px;text-align:center;">完了率</th>
            <th style="padding:6px 8px;text-align:center;">平均視聴</th>
          </tr>
        </thead>
        <tbody>${cmRows || '<tr><td colspan="4" style="padding:8px;text-align:center;color:#999;">データなし</td></tr>'}</tbody>
      </table>
    `;

    const subject = `[VLS] ROIレポート — ${periodStr}`;
    const html = wrapHtml(emailBody, "#6EC6FF");
    const fromAddress = process.env.EMAIL_FROM || "VLS System <onboarding@resend.dev>";

    // Send email: Resend → SendGrid → console.log
    const resendKey = process.env.RESEND_API_KEY;
    if (isRealKey(resendKey)) {
      try {
        const resend = new Resend(resendKey);
        const { data, error } = await resend.emails.send({
          from: fromAddress, to: [email], subject, html,
        });
        if (!error && data) {
          return NextResponse.json({ success: true, method: "resend" });
        }
        console.error("Resend error:", error?.message);
      } catch (err) {
        console.error("Resend exception:", err);
      }
    }

    const sendgridKey = process.env.SENDGRID_API_KEY;
    if (isRealKey(sendgridKey)) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sendgridKey}` },
          body: JSON.stringify({
            personalizations: [{ to: [{ email }] }],
            from: { email: process.env.SENDGRID_FROM_EMAIL || "noreply@vls-system.vercel.app", name: "VLS System" },
            subject,
            content: [{ type: "text/html", value: html }],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (sgRes.ok || sgRes.status === 202) {
          return NextResponse.json({ success: true, method: "sendgrid" });
        }
      } catch (err) {
        console.error("SendGrid exception:", err);
      }
    }

    // Fallback: console.log
    console.log(`[ROI-REPORT] ${subject} → ${email}`);
    return NextResponse.json({
      success: true,
      method: "logged",
      note: "メールプロバイダー未設定のためログ出力のみ。RESEND_API_KEY を設定してください。",
    });
  } catch (error) {
    logError({ route: "/api/roi-report", error });
    return NextResponse.json(
      { error: "レポート送信に失敗しました", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

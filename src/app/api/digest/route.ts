import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { d1Get, isD1Configured } from "@/lib/d1";
import { Resend } from "resend";
import { logError } from "@/lib/errorLog";
import type {
  AnalyticsRecord,
  VideoPlayRecord,
  NpsResponse,
  Purchase,
  Tenant,
} from "@/lib/types";

export const runtime = "nodejs";

/* ─── week boundaries ─── */
function weekRange(weeksAgo: number): { start: number; end: number } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const thisMonday = new Date(now);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(thisMonday.getDate() + mondayOffset);

  const start = new Date(thisMonday);
  start.setDate(start.getDate() - weeksAgo * 7);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return { start: start.getTime(), end: end.getTime() };
}

/* ─── KPI calculation ─── */
interface WeekKPI {
  newAccess: number;
  dlComplete: number;
  cmCompletionRate: number; // 0-100
  npsAvg: number | null;
  totalSales: number;
}

function calcKPI(
  analytics: AnalyticsRecord[],
  videoPlays: VideoPlayRecord[],
  nps: NpsResponse[],
  purchases: Purchase[],
  range: { start: number; end: number },
  tenantId?: string | null,
): WeekKPI {
  const inRange = <T extends { timestamp?: number; sentAt?: number; createdAt?: number }>(
    arr: T[],
    tsField: "timestamp" | "sentAt" | "createdAt",
  ) =>
    arr.filter((r) => {
      const ts = (r as Record<string, unknown>)[tsField] as number | undefined;
      return ts && ts >= range.start && ts < range.end;
    });

  const weekAnalytics = inRange(analytics, "timestamp");
  const weekVideos = inRange(videoPlays, "timestamp");
  const weekNps = inRange(nps, "sentAt").filter((n) => n.score != null);
  const weekPurchases = inRange(purchases, "createdAt").filter(
    (p) => p.status === "completed",
  );

  // Tenant filter
  const filterTenant = <T extends { eventId?: string; tenantId?: string }>(arr: T[]) =>
    tenantId ? arr.filter((r) => r.tenantId === tenantId || r.eventId?.startsWith(tenantId)) : arr;

  const fAnalytics = filterTenant(weekAnalytics);
  const fVideos = filterTenant(weekVideos);
  const fNps = filterTenant(weekNps as (NpsResponse & { tenantId?: string })[]);
  const fPurchases = filterTenant(weekPurchases);

  const newAccess = fAnalytics.length;
  const dlComplete = fAnalytics.filter((a) => a.stepsCompleted?.downloaded).length;
  const cmTotal = fVideos.length;
  const cmCompleted = fVideos.filter((v) => v.completed).length;
  const cmCompletionRate = cmTotal > 0 ? Math.round((cmCompleted / cmTotal) * 100) : 0;
  const npsScores = fNps.map((n) => n.score!);
  const npsAvg =
    npsScores.length > 0
      ? Math.round((npsScores.reduce((a, b) => a + b, 0) / npsScores.length) * 10) / 10
      : null;
  const totalSales = fPurchases.reduce((sum, p) => sum + (p.amount || 0), 0);

  return { newAccess, dlComplete, cmCompletionRate, npsAvg, totalSales };
}

/* ─── comparison helpers ─── */
function pctChange(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "+∞%" : "—";
  const pct = Math.round(((current - prev) / prev) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function arrow(current: number, prev: number): string {
  if (current > prev) return "↑";
  if (current < prev) return "↓";
  return "→";
}

/* ─── HTML email builder ─── */
function buildDigestHtml(
  tenantName: string,
  current: WeekKPI,
  prev: WeekKPI,
  weekLabel: string,
): string {
  const accent = "#6EC6FF";

  const kpiRow = (
    label: string,
    cur: number | string,
    prevVal: number | string,
    unit: string,
  ) => {
    const curNum = typeof cur === "number" ? cur : 0;
    const prevNum = typeof prevVal === "number" ? prevVal : 0;
    const change = pctChange(curNum, prevNum);
    const arw = arrow(curNum, prevNum);
    const arwColor = curNum > prevNum ? "#22C55E" : curNum < prevNum ? "#EF4444" : "#94A3B8";
    return `<tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#555;">${label}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:20px;font-weight:700;color:#333;">${cur}${unit}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#999;">${prevVal}${unit}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:600;color:${arwColor};">${arw} ${change}</td>
    </tr>`;
  };

  const tableRows = [
    kpiRow("新規アクセス数", current.newAccess, prev.newAccess, ""),
    kpiRow("DL完了数", current.dlComplete, prev.dlComplete, ""),
    kpiRow("CM視聴完了率", current.cmCompletionRate, prev.cmCompletionRate, "%"),
    kpiRow("NPS平均", current.npsAvg ?? "—", prev.npsAvg ?? "—", ""),
    kpiRow(
      "売上合計",
      current.totalSales.toLocaleString(),
      prev.totalSales.toLocaleString(),
      "円",
    ),
  ].join("");

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
    <span style="display:block;font-size:11px;color:#999;margin-top:2px;">Weekly Digest — ${weekLabel}</span>
  </td></tr>
  <tr><td style="padding:8px 32px 4px 32px;">
    <h2 style="color:#333;font-size:18px;margin:0 0 4px 0;">${tenantName} 週次レポート</h2>
    <p style="color:#999;font-size:13px;margin:0 0 16px 0;">${weekLabel} の主要KPIサマリー</p>
  </td></tr>
  <tr><td style="padding:0 32px 24px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;overflow:hidden;">
      <thead>
        <tr style="background-color:#fafafa;">
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#999;font-weight:600;">指標</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#999;font-weight:600;">今週</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#999;font-weight:600;">前週</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#999;font-weight:600;">変化</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </td></tr>
  <tr><td style="background-color:#fafafa;padding:20px 32px;border-top:1px solid #eee;text-align:center;">
    <p style="margin:0 0 4px 0;font-size:11px;color:#999;">&copy; ${new Date().getFullYear()} VLS System — Weekly Digest</p>
    <p style="margin:0;font-size:11px;color:#bbb;">このメールはシステムから自動送信されています。</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ─── parse D1 JSON safely ─── */
function parseD1<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

/**
 * GET /api/digest
 * Preview digest KPIs (admin only).
 */
export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  const tenantId = (request.nextUrl.searchParams.get("tenantId") || null) as string | null;

  const [rawAnalytics, rawVideos, rawNps, rawPurchases] = await Promise.all([
    d1Get("vls_analytics"),
    d1Get("vls_video_plays"),
    d1Get("vls_nps_responses"),
    d1Get("vls_purchases"),
  ]);

  const analytics = parseD1<AnalyticsRecord>(rawAnalytics);
  const videoPlays = parseD1<VideoPlayRecord>(rawVideos);
  const nps = parseD1<NpsResponse>(rawNps);
  const purchases = parseD1<Purchase>(rawPurchases);

  const thisWeek = weekRange(0);
  const lastWeek = weekRange(1);

  const current = calcKPI(analytics, videoPlays, nps, purchases, thisWeek, tenantId);
  const prev = calcKPI(analytics, videoPlays, nps, purchases, lastWeek, tenantId);

  const startDate = new Date(thisWeek.start).toISOString().slice(0, 10);
  const endDate = new Date(thisWeek.end).toISOString().slice(0, 10);

  return NextResponse.json({
    weekLabel: `${startDate} ~ ${endDate}`,
    current,
    previous: prev,
    comparison: {
      newAccess: { change: pctChange(current.newAccess, prev.newAccess), arrow: arrow(current.newAccess, prev.newAccess) },
      dlComplete: { change: pctChange(current.dlComplete, prev.dlComplete), arrow: arrow(current.dlComplete, prev.dlComplete) },
      cmCompletionRate: { change: pctChange(current.cmCompletionRate, prev.cmCompletionRate), arrow: arrow(current.cmCompletionRate, prev.cmCompletionRate) },
      npsAvg: { change: current.npsAvg != null && prev.npsAvg != null ? pctChange(current.npsAvg, prev.npsAvg) : "—", arrow: current.npsAvg != null && prev.npsAvg != null ? arrow(current.npsAvg, prev.npsAvg) : "→" },
      totalSales: { change: pctChange(current.totalSales, prev.totalSales), arrow: arrow(current.totalSales, prev.totalSales) },
    },
  });
}

/**
 * POST /api/digest
 * Send digest email to tenant admin(s).
 * Body: { tenantId?: string }
 */
export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const targetTenantId = (body as { tenantId?: string }).tenantId || null;

    const [rawAnalytics, rawVideos, rawNps, rawPurchases, rawTenants] = await Promise.all([
      d1Get("vls_analytics"),
      d1Get("vls_video_plays"),
      d1Get("vls_nps_responses"),
      d1Get("vls_purchases"),
      d1Get("vls_admin_tenants"),
    ]);

    const analytics = parseD1<AnalyticsRecord>(rawAnalytics);
    const videoPlays = parseD1<VideoPlayRecord>(rawVideos);
    const nps = parseD1<NpsResponse>(rawNps);
    const purchases = parseD1<Purchase>(rawPurchases);
    const tenants = parseD1<Tenant>(rawTenants).filter(
      (t) => t.isActive !== false && t.contactEmail,
    );

    const thisWeek = weekRange(0);
    const lastWeek = weekRange(1);
    const startDate = new Date(thisWeek.start).toISOString().slice(0, 10);
    const endDate = new Date(thisWeek.end).toISOString().slice(0, 10);
    const weekLabel = `${startDate} ~ ${endDate}`;

    const resendKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.EMAIL_FROM || "VLS System <onboarding@resend.dev>";
    const results: { tenantId: string; tenantName: string; status: string; error?: string }[] = [];

    const targetTenants = targetTenantId
      ? tenants.filter((t) => t.id === targetTenantId)
      : tenants;

    for (const tenant of targetTenants) {
      const current = calcKPI(analytics, videoPlays, nps, purchases, thisWeek, tenant.id);
      const prev = calcKPI(analytics, videoPlays, nps, purchases, lastWeek, tenant.id);
      const html = buildDigestHtml(tenant.name, current, prev, weekLabel);
      const subject = `[VLS] ${tenant.name} 週次ダイジェスト — ${weekLabel}`;

      if (resendKey && !resendKey.toLowerCase().includes("placeholder")) {
        try {
          const resend = new Resend(resendKey);
          const { error } = await resend.emails.send({
            from: fromAddress,
            to: [tenant.contactEmail],
            subject,
            html,
          });
          if (error) {
            results.push({ tenantId: tenant.id, tenantName: tenant.name, status: "failed", error: error.message });
          } else {
            results.push({ tenantId: tenant.id, tenantName: tenant.name, status: "sent" });
          }
        } catch (err) {
          results.push({
            tenantId: tenant.id,
            tenantName: tenant.name,
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        console.log(`[DIGEST] ${subject} → ${tenant.contactEmail}`);
        results.push({ tenantId: tenant.id, tenantName: tenant.name, status: "logged" });
      }
    }

    return NextResponse.json({ success: true, weekLabel, results });
  } catch (error) {
    logError({ route: "/api/digest", error });
    return NextResponse.json(
      { error: "Failed to send digest", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

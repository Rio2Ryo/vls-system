"use client";

import { jsPDF } from "jspdf";
import {
  getStoredEvents, getStoredAnalytics, getStoredVideoPlays,
  getStoredNpsResponses, getStoredParticipants,
} from "./store";
import { AnalyticsRecord, VideoPlayRecord, NpsResponse, Participant } from "./types";

// --- KPI calculation ---

export interface EventKPI {
  eventId: string;
  eventName: string;
  eventDate: string;
  venue: string;
  // Participants
  totalParticipants: number;
  checkedInCount: number;
  checkinRate: number;          // checkedIn / total (or analytics access count if no participants)
  // Funnel
  accessCount: number;
  surveyCount: number;
  cmViewedCount: number;
  photosViewedCount: number;
  downloadedCount: number;
  // Rates
  surveyRate: number;           // survey / access
  cmViewRate: number;           // cmViewed / access
  downloadRate: number;         // downloaded / access
  // CM stats
  totalCmPlays: number;
  cmCompletionRate: number;     // completed / total plays
  avgWatchSeconds: number;
  // NPS
  npsScore: number | null;      // NPS score (-100 to 100) or null if no data
  npsResponseCount: number;
  npsPromoters: number;         // score 9-10
  npsPassives: number;          // score 7-8
  npsDetractors: number;        // score 0-6
}

export function calcEventKPI(eventId: string): EventKPI {
  const events = getStoredEvents();
  const event = events.find((e) => e.id === eventId);
  if (!event) {
    return emptyKPI(eventId);
  }

  const analytics = getStoredAnalytics().filter((a) => a.eventId === eventId);
  const videoPlays = getStoredVideoPlays().filter((v) => v.eventId === eventId);
  const npsResponses = getStoredNpsResponses().filter((n) => n.eventId === eventId);
  const participants = getStoredParticipants().filter((p) => p.eventId === eventId);

  return computeKPI(event.id, event.name, event.date, event.venue || "", analytics, videoPlays, npsResponses, participants);
}

export function calcMultiEventKPI(eventIds: string[]): EventKPI[] {
  return eventIds.map((id) => calcEventKPI(id));
}

function computeKPI(
  eventId: string,
  eventName: string,
  eventDate: string,
  venue: string,
  analytics: AnalyticsRecord[],
  videoPlays: VideoPlayRecord[],
  npsResponses: NpsResponse[],
  participants: Participant[],
): EventKPI {
  const accessCount = analytics.filter((a) => a.stepsCompleted.access).length;
  const surveyCount = analytics.filter((a) => a.stepsCompleted.survey).length;
  const cmViewedCount = analytics.filter((a) => a.stepsCompleted.cmViewed).length;
  const photosViewedCount = analytics.filter((a) => a.stepsCompleted.photosViewed).length;
  const downloadedCount = analytics.filter((a) => a.stepsCompleted.downloaded).length;

  const totalParticipants = participants.length;
  const checkedInCount = participants.filter((p) => p.checkedIn).length;
  const checkinRate = totalParticipants > 0 ? checkedInCount / totalParticipants : (accessCount > 0 ? 1 : 0);

  const surveyRate = accessCount > 0 ? surveyCount / accessCount : 0;
  const cmViewRate = accessCount > 0 ? cmViewedCount / accessCount : 0;
  const downloadRate = accessCount > 0 ? downloadedCount / accessCount : 0;

  const totalCmPlays = videoPlays.length;
  const completedCmPlays = videoPlays.filter((v) => v.completed).length;
  const cmCompletionRate = totalCmPlays > 0 ? completedCmPlays / totalCmPlays : 0;
  const avgWatchSeconds = totalCmPlays > 0
    ? videoPlays.reduce((s, v) => s + v.watchedSeconds, 0) / totalCmPlays
    : 0;

  // NPS
  const responded = npsResponses.filter((n) => n.score !== undefined && n.score !== null);
  const npsResponseCount = responded.length;
  const npsPromoters = responded.filter((n) => (n.score ?? 0) >= 9).length;
  const npsPassives = responded.filter((n) => (n.score ?? 0) >= 7 && (n.score ?? 0) <= 8).length;
  const npsDetractors = responded.filter((n) => (n.score ?? 0) <= 6).length;
  const npsScore = npsResponseCount > 0
    ? Math.round(((npsPromoters - npsDetractors) / npsResponseCount) * 100)
    : null;

  return {
    eventId, eventName, eventDate, venue,
    totalParticipants, checkedInCount, checkinRate,
    accessCount, surveyCount, cmViewedCount, photosViewedCount, downloadedCount,
    surveyRate, cmViewRate, downloadRate,
    totalCmPlays, cmCompletionRate, avgWatchSeconds,
    npsScore, npsResponseCount, npsPromoters, npsPassives, npsDetractors,
  };
}

function emptyKPI(eventId: string): EventKPI {
  return {
    eventId, eventName: "不明", eventDate: "", venue: "",
    totalParticipants: 0, checkedInCount: 0, checkinRate: 0,
    accessCount: 0, surveyCount: 0, cmViewedCount: 0, photosViewedCount: 0, downloadedCount: 0,
    surveyRate: 0, cmViewRate: 0, downloadRate: 0,
    totalCmPlays: 0, cmCompletionRate: 0, avgWatchSeconds: 0,
    npsScore: null, npsResponseCount: 0, npsPromoters: 0, npsPassives: 0, npsDetractors: 0,
  };
}

// --- Formatting helpers ---

function fmtPct(n: number): string { return `${Math.round(n * 100)}%`; }
function fmtNum(n: number): string { return n.toLocaleString(); }

function npsColor(score: number | null): string {
  if (score === null) return "#999";
  if (score >= 50) return "#22C55E";
  if (score >= 0) return "#EAB308";
  return "#EF4444";
}

function rateColor(rate: number): string {
  if (rate >= 0.7) return "#22C55E";
  if (rate >= 0.4) return "#EAB308";
  return "#EF4444";
}

// --- PDF generation ---

export async function generateEventCompareReport(eventIds: string[]): Promise<jsPDF> {
  const kpis = calcMultiEventKPI(eventIds);
  const today = new Date().toLocaleDateString("ja", { year: "numeric", month: "long", day: "numeric" });

  // Build comparison table rows
  const eventHeaders = kpis.map((k) => `
    <th style="padding:6px 8px;font-size:10px;font-weight:bold;color:#333;border-bottom:2px solid #6EC6FF;white-space:nowrap;">
      ${k.eventName}<br/><span style="font-weight:normal;color:#888;font-size:8px;">${k.eventDate}</span>
    </th>
  `).join("");

  function metricRow(label: string, getValue: (k: EventKPI) => string, getColor?: (k: EventKPI) => string): string {
    const cells = kpis.map((k) => {
      const color = getColor ? getColor(k) : "#333";
      return `<td style="padding:5px 8px;text-align:center;font-size:10px;font-weight:bold;color:${color};border-bottom:1px solid #f0f0f0;">${getValue(k)}</td>`;
    }).join("");
    return `<tr><td style="padding:5px 8px;font-size:10px;color:#666;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${label}</td>${cells}</tr>`;
  }

  // Best performers highlighting
  function findBest(items: EventKPI[], getter: (k: EventKPI) => number): string {
    if (items.length === 0) return "";
    let best = items[0];
    for (const k of items) {
      if (getter(k) > getter(best)) best = k;
    }
    return best.eventName;
  }

  const bestAccess = findBest(kpis, (k) => k.accessCount);
  const bestCm = findBest(kpis, (k) => k.cmViewRate);
  const bestDl = findBest(kpis, (k) => k.downloadRate);
  const bestNps = findBest(kpis.filter((k) => k.npsScore !== null), (k) => k.npsScore ?? -101);

  const summaryItems = [
    { label: "最多アクセス", value: bestAccess },
    { label: "最高CM視聴率", value: bestCm },
    { label: "最高DL率", value: bestDl },
    ...(bestNps ? [{ label: "最高NPS", value: bestNps }] : []),
  ];

  const summaryHtml = summaryItems.map((item) => `
    <div style="flex:1;background:#f8f8fc;border-radius:6px;padding:8px;text-align:center;">
      <p style="font-size:11px;font-weight:bold;margin:0;color:#6EC6FF;">${item.value}</p>
      <p style="font-size:8px;color:#999;margin:2px 0 0;">${item.label}</p>
    </div>
  `).join("");

  // Funnel comparison bar chart (CSS-based)
  const maxAccess = Math.max(...kpis.map((k) => k.accessCount), 1);
  const funnelSteps = [
    { label: "アクセス", getter: (k: EventKPI) => k.accessCount },
    { label: "アンケート", getter: (k: EventKPI) => k.surveyCount },
    { label: "CM視聴", getter: (k: EventKPI) => k.cmViewedCount },
    { label: "写真閲覧", getter: (k: EventKPI) => k.photosViewedCount },
    { label: "DL完了", getter: (k: EventKPI) => k.downloadedCount },
  ];

  const barColors = ["#6EC6FF", "#F59E0B", "#10B981", "#8B5CF6", "#EF4444"];
  const funnelRows = funnelSteps.map((step) => {
    const bars = kpis.map((k, i) => {
      const val = step.getter(k);
      const width = maxAccess > 0 ? (val / maxAccess) * 100 : 0;
      const color = barColors[i % barColors.length];
      return `<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
        <span style="font-size:7px;width:50px;text-align:right;color:#888;overflow:hidden;white-space:nowrap;">${k.eventName.slice(0, 6)}</span>
        <div style="flex:1;background:#f0f0f5;border-radius:3px;height:10px;overflow:hidden;">
          <div style="width:${Math.max(width, 1)}%;height:100%;background:${color};border-radius:3px;"></div>
        </div>
        <span style="font-size:7px;width:24px;color:#666;">${val}</span>
      </div>`;
    }).join("");
    return `<div style="margin-bottom:8px;">
      <p style="font-size:9px;font-weight:bold;color:#555;margin:0 0 3px;">${step.label}</p>
      ${bars}
    </div>`;
  }).join("");

  const html = `
    <div style="font-family:'Hiragino Sans','Meiryo','Noto Sans JP',sans-serif;max-width:720px;margin:0 auto;padding:20px;color:#333;">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:3px solid #6EC6FF;">
        <div>
          <h1 style="font-size:18px;margin:0;color:#222;">イベント比較レポート</h1>
          <p style="font-size:10px;color:#999;margin:4px 0 0;">発行日: ${today} | 比較対象: ${kpis.length}イベント</p>
        </div>
        <div style="text-align:right;">
          <span style="font-size:24px;font-weight:700;color:#6EC6FF;">VLS</span>
          <p style="font-size:8px;color:#aaa;margin:2px 0 0;">Video Learning System</p>
        </div>
      </div>

      <!-- Summary badges -->
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        ${summaryHtml}
      </div>

      <!-- Main comparison table -->
      <div style="margin-bottom:16px;">
        <h2 style="font-size:12px;color:#444;margin:0 0 8px;border-left:3px solid #6EC6FF;padding-left:8px;">KPI比較テーブル</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10px;">
          <thead>
            <tr>
              <th style="padding:6px 8px;font-size:10px;text-align:left;color:#999;border-bottom:2px solid #6EC6FF;">指標</th>
              ${eventHeaders}
            </tr>
          </thead>
          <tbody>
            ${metricRow("参加者数", (k) => fmtNum(k.totalParticipants || k.accessCount))}
            ${metricRow("アクセス数", (k) => fmtNum(k.accessCount))}
            ${metricRow("アンケート回答率", (k) => fmtPct(k.surveyRate), (k) => rateColor(k.surveyRate))}
            ${metricRow("CM視聴率", (k) => fmtPct(k.cmViewRate), (k) => rateColor(k.cmViewRate))}
            ${metricRow("CM完了率", (k) => fmtPct(k.cmCompletionRate), (k) => rateColor(k.cmCompletionRate))}
            ${metricRow("平均視聴秒", (k) => `${k.avgWatchSeconds.toFixed(1)}秒`)}
            ${metricRow("写真DL率", (k) => fmtPct(k.downloadRate), (k) => rateColor(k.downloadRate))}
            ${metricRow("NPSスコア", (k) => k.npsScore !== null ? String(k.npsScore) : "—", (k) => npsColor(k.npsScore))}
            ${metricRow("NPS回答数", (k) => fmtNum(k.npsResponseCount))}
          </tbody>
        </table>
      </div>

      <!-- Funnel chart -->
      <div style="margin-bottom:16px;">
        <h2 style="font-size:12px;color:#444;margin:0 0 8px;border-left:3px solid #6EC6FF;padding-left:8px;">ファネル比較</h2>
        ${funnelRows}
      </div>

      <!-- Legend -->
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        ${kpis.map((k, i) => `
          <div style="display:flex;align-items:center;gap:4px;">
            <div style="width:10px;height:10px;border-radius:2px;background:${barColors[i % barColors.length]};"></div>
            <span style="font-size:8px;color:#666;">${k.eventName}</span>
          </div>
        `).join("")}
      </div>

      <!-- Footer -->
      <div style="border-top:1px solid #eee;padding-top:8px;margin-top:12px;">
        <p style="font-size:8px;color:#bbb;text-align:center;">&copy; ${new Date().getFullYear()} VLS System &mdash; Event Photo Service &mdash; 自動生成レポート</p>
      </div>
    </div>
  `;

  // Generate PDF using jsPDF + html rendering
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Create a temporary container for HTML rendering
  const container = document.createElement("div");
  container.style.width = "280mm";
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.innerHTML = html;
  document.body.appendChild(container);

  await new Promise<void>((resolve) => {
    doc.html(container, {
      callback: () => {
        document.body.removeChild(container);
        resolve();
      },
      x: 5,
      y: 5,
      width: 280,
      windowWidth: 1100,
    });
  });

  return doc;
}

/** Generate and immediately download the PDF */
export async function downloadEventCompareReport(eventIds: string[]): Promise<void> {
  const doc = await generateEventCompareReport(eventIds);
  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`event-compare-report-${dateStr}.pdf`);
}

/** Generate and return PDF as base64 data URL */
export async function getEventCompareReportBase64(eventIds: string[]): Promise<string> {
  const doc = await generateEventCompareReport(eventIds);
  return doc.output("datauristring");
}

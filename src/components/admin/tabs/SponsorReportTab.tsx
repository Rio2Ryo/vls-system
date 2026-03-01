"use client";

import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import Card from "@/components/ui/Card";
import { Company, VideoPlayRecord, AnalyticsRecord, EventData } from "@/lib/types";
import {
  getStoredCompanies,
  getStoredVideoPlays,
  getStoredAnalytics,
  getStoredEvents,
  getVideoPlaysForTenant,
  getAnalyticsForTenant,
  getEventsForTenant,
} from "@/lib/store";
import { inputCls } from "./adminUtils";

interface Props {
  onSave: (msg: string) => void;
  tenantId?: string | null;
}

const TIER_LABEL: Record<string, string> = {
  platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze",
};
const TIER_COLOR: Record<string, string> = {
  platinum: "#6EC6FF", gold: "#FBBF24", silver: "#9CA3AF", bronze: "#F97316",
};

const AGE_LABELS: Record<string, string> = {
  age_0_3: "0〜3歳", age_4_6: "4〜6歳", age_7_9: "7〜9歳",
  age_10_12: "10〜12歳", age_13_plus: "13歳以上",
};
const INTEREST_LABELS: Record<string, string> = {
  education: "教育", sports: "スポーツ", food: "食", travel: "旅行",
  technology: "テクノロジー", art: "アート", nature: "自然",
  cram_school: "学習塾", lessons: "習い事", food_product: "食品",
  travel_service: "旅行サービス", smartphone: "スマホ", camera: "カメラ", insurance: "保険",
};

// CPV base rates per completed view (JPY)
const CPV_RATES: Record<string, number> = {
  platinum: 50, gold: 35, silver: 20, bronze: 10,
};

function fmtNum(n: number): string { return n.toLocaleString(); }
function fmtPct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : "—";
}
function fmtSec(n: number): string { return `${n.toFixed(1)}秒`; }
function fmtYen(n: number): string { return `¥${n.toLocaleString()}`; }

interface CompanyStats {
  totalPlays: number;
  completedPlays: number;
  completionRate: number;
  avgWatchSec: number;
  cm15: CmTypeStats;
  cm30: CmTypeStats;
  cm60: CmTypeStats;
  audienceCount: number;
  ageDist: { label: string; count: number }[];
  interestDist: { label: string; count: number }[];
  cpvRate: number;
  estimatedCost: number;
  eventBreakdown: { name: string; plays: number; completed: number }[];
}

interface CmTypeStats {
  total: number;
  completed: number;
  avgWatch: number;
}

function calcStats(
  companyId: string,
  company: Company | undefined,
  videoPlays: VideoPlayRecord[],
  analytics: AnalyticsRecord[],
  events: EventData[],
): CompanyStats {
  const plays = videoPlays.filter((v) => v.companyId === companyId);
  const totalPlays = plays.length;
  const completedPlays = plays.filter((v) => v.completed).length;
  const completionRate = totalPlays > 0 ? completedPlays / totalPlays : 0;
  const avgWatchSec = totalPlays > 0
    ? plays.reduce((s, v) => s + v.watchedSeconds, 0) / totalPlays
    : 0;

  const byCmType = (type: "cm15" | "cm30" | "cm60"): CmTypeStats => {
    const tp = plays.filter((v) => v.cmType === type);
    return {
      total: tp.length,
      completed: tp.filter((v) => v.completed).length,
      avgWatch: tp.length > 0 ? tp.reduce((s, v) => s + v.watchedSeconds, 0) / tp.length : 0,
    };
  };

  // Audience from matched analytics
  const matchedRecords = analytics.filter(
    (a) => a.matchedCompanyId === companyId || a.platinumCompanyId === companyId
  );

  const ageCounts: Record<string, number> = {};
  const interestCounts: Record<string, number> = {};
  for (const rec of matchedRecords) {
    if (rec.surveyAnswers) {
      for (const tags of Object.values(rec.surveyAnswers)) {
        for (const tag of tags) {
          if (tag.startsWith("age_")) {
            ageCounts[tag] = (ageCounts[tag] || 0) + 1;
          } else {
            interestCounts[tag] = (interestCounts[tag] || 0) + 1;
          }
        }
      }
    }
  }

  const ageDist = Object.entries(ageCounts)
    .map(([k, count]) => ({ label: AGE_LABELS[k] || k, count }))
    .sort((a, b) => b.count - a.count);

  const interestDist = Object.entries(interestCounts)
    .map(([k, count]) => ({ label: INTEREST_LABELS[k] || k, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const cpvRate = CPV_RATES[company?.tier || "bronze"] || 10;

  // Event breakdown
  const eventMap: Record<string, { plays: number; completed: number }> = {};
  for (const p of plays) {
    if (!eventMap[p.eventId]) eventMap[p.eventId] = { plays: 0, completed: 0 };
    eventMap[p.eventId].plays++;
    if (p.completed) eventMap[p.eventId].completed++;
  }
  const eventBreakdown = Object.entries(eventMap).map(([eid, d]) => ({
    name: events.find((e) => e.id === eid)?.name || eid,
    ...d,
  }));

  return {
    totalPlays,
    completedPlays,
    completionRate,
    avgWatchSec,
    cm15: byCmType("cm15"),
    cm30: byCmType("cm30"),
    cm60: byCmType("cm60"),
    audienceCount: matchedRecords.length,
    ageDist,
    interestDist,
    cpvRate,
    estimatedCost: completedPlays * cpvRate,
    eventBreakdown,
  };
}

// ─── PDF generation ───────────────────────────────────────────────

function generateReportPdf(company: Company, stats: CompanyStats) {
  const tierColor = TIER_COLOR[company.tier] || "#6EC6FF";
  const today = new Date().toLocaleDateString("ja", { year: "numeric", month: "long", day: "numeric" });

  const cmTypeRows = [
    { label: "15秒 (Platinum)", ...stats.cm15 },
    { label: "30秒 (Preview)", ...stats.cm30 },
    { label: "60秒 (Full)", ...stats.cm60 },
  ]
    .filter((r) => r.total > 0)
    .map((r) => `
      <tr>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;">${r.label}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;">${r.total}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;">${r.completed}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;">${r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0}%</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;">${r.avgWatch.toFixed(1)}秒</td>
      </tr>
    `)
    .join("");

  const ageBarMax = Math.max(...stats.ageDist.map((d) => d.count), 1);
  const ageBars = stats.ageDist
    .map((d) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-size:10px;width:60px;text-align:right;color:#666;">${d.label}</span>
        <div style="flex:1;background:#f0f0f5;border-radius:4px;height:14px;overflow:hidden;">
          <div style="width:${(d.count / ageBarMax) * 100}%;height:100%;background:${tierColor};border-radius:4px;"></div>
        </div>
        <span style="font-size:10px;width:30px;color:#888;">${d.count}</span>
      </div>
    `)
    .join("");

  const interestTags = stats.interestDist
    .map((d) => `<span style="display:inline-block;font-size:10px;padding:2px 8px;margin:2px;background:#f0f4ff;border-radius:10px;color:#4B5563;">${d.label} (${d.count})</span>`)
    .join("");

  const eventRows = stats.eventBreakdown
    .map((e) => `
      <tr>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;">${e.name}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;font-size:11px;">${e.plays}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;font-size:11px;">${e.completed}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;font-size:11px;">${e.plays > 0 ? Math.round((e.completed / e.plays) * 100) : 0}%</td>
      </tr>
    `)
    .join("");

  const html = `
    <div style="font-family:'Hiragino Sans','Meiryo','Noto Sans JP',sans-serif;max-width:680px;margin:0 auto;padding:28px;color:#333;">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid ${tierColor};">
        <div>
          <h1 style="font-size:20px;margin:0;color:#222;">スポンサーレポート</h1>
          <p style="font-size:11px;color:#999;margin:4px 0 0;">発行日: ${today}</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:16px;font-weight:bold;margin:0;color:#222;">${company.name}</p>
          <span style="display:inline-block;font-size:10px;padding:2px 10px;border-radius:10px;color:white;background:${tierColor};font-weight:bold;">${TIER_LABEL[company.tier]}</span>
        </div>
      </div>

      <!-- KPI Summary -->
      <div style="display:flex;gap:12px;margin-bottom:20px;">
        <div style="flex:1;background:#f8f8fc;border-radius:8px;padding:12px;text-align:center;">
          <p style="font-size:22px;font-weight:bold;margin:0;color:${tierColor};">${fmtNum(stats.totalPlays)}</p>
          <p style="font-size:10px;color:#999;margin:2px 0 0;">総再生数</p>
        </div>
        <div style="flex:1;background:#f8f8fc;border-radius:8px;padding:12px;text-align:center;">
          <p style="font-size:22px;font-weight:bold;margin:0;color:${stats.completionRate >= 0.7 ? '#22C55E' : stats.completionRate >= 0.4 ? '#EAB308' : '#EF4444'};">${Math.round(stats.completionRate * 100)}%</p>
          <p style="font-size:10px;color:#999;margin:2px 0 0;">完了率</p>
        </div>
        <div style="flex:1;background:#f8f8fc;border-radius:8px;padding:12px;text-align:center;">
          <p style="font-size:22px;font-weight:bold;margin:0;color:#6366F1;">${stats.avgWatchSec.toFixed(1)}秒</p>
          <p style="font-size:10px;color:#999;margin:2px 0 0;">平均視聴</p>
        </div>
        <div style="flex:1;background:#f8f8fc;border-radius:8px;padding:12px;text-align:center;">
          <p style="font-size:22px;font-weight:bold;margin:0;color:#8B5CF6;">${fmtNum(stats.audienceCount)}</p>
          <p style="font-size:10px;color:#999;margin:2px 0 0;">視聴者数</p>
        </div>
      </div>

      <!-- CM Type Breakdown -->
      <h2 style="font-size:13px;color:#555;border-bottom:1px solid #eee;padding-bottom:6px;margin:16px 0 8px;">CM種別パフォーマンス</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;">
        <thead>
          <tr style="background:#f0f0f5;">
            <th style="padding:6px 8px;text-align:left;">種別</th>
            <th style="padding:6px 8px;text-align:center;">再生数</th>
            <th style="padding:6px 8px;text-align:center;">完了数</th>
            <th style="padding:6px 8px;text-align:center;">完了率</th>
            <th style="padding:6px 8px;text-align:center;">平均視聴</th>
          </tr>
        </thead>
        <tbody>${cmTypeRows || '<tr><td colspan="5" style="padding:8px;text-align:center;color:#999;">データなし</td></tr>'}</tbody>
      </table>

      <!-- Event Breakdown -->
      ${stats.eventBreakdown.length > 0 ? `
        <h2 style="font-size:13px;color:#555;border-bottom:1px solid #eee;padding-bottom:6px;margin:16px 0 8px;">イベント別内訳</h2>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;">
          <thead>
            <tr style="background:#f0f0f5;">
              <th style="padding:5px 8px;text-align:left;">イベント名</th>
              <th style="padding:5px 8px;text-align:center;">再生</th>
              <th style="padding:5px 8px;text-align:center;">完了</th>
              <th style="padding:5px 8px;text-align:center;">完了率</th>
            </tr>
          </thead>
          <tbody>${eventRows}</tbody>
        </table>
      ` : ""}

      <!-- Audience Demographics -->
      <h2 style="font-size:13px;color:#555;border-bottom:1px solid #eee;padding-bottom:6px;margin:16px 0 8px;">視聴者属性</h2>
      ${stats.ageDist.length > 0 ? `
        <p style="font-size:10px;color:#999;margin:0 0 6px;">年齢分布</p>
        <div style="margin-bottom:12px;">${ageBars}</div>
      ` : '<p style="font-size:11px;color:#999;margin-bottom:12px;">年齢データなし</p>'}
      ${stats.interestDist.length > 0 ? `
        <p style="font-size:10px;color:#999;margin:0 0 6px;">関心タグ</p>
        <div style="margin-bottom:12px;">${interestTags}</div>
      ` : ""}

      <!-- CPV Estimate -->
      <h2 style="font-size:13px;color:#555;border-bottom:1px solid #eee;padding-bottom:6px;margin:16px 0 8px;">CPV試算</h2>
      <div style="display:flex;gap:16px;margin-bottom:16px;">
        <div style="flex:1;">
          <table style="font-size:11px;border-collapse:collapse;">
            <tr><td style="padding:3px 0;color:#888;">CPV単価 (${TIER_LABEL[company.tier]})</td><td style="padding:3px 8px;font-weight:bold;">${fmtYen(stats.cpvRate)}</td></tr>
            <tr><td style="padding:3px 0;color:#888;">完了視聴数</td><td style="padding:3px 8px;font-weight:bold;">${fmtNum(stats.completedPlays)}</td></tr>
            <tr style="border-top:1px solid #ddd;"><td style="padding:6px 0;color:#222;font-weight:bold;">推定広告費</td><td style="padding:6px 8px;font-size:16px;font-weight:bold;color:${tierColor};">${fmtYen(stats.estimatedCost)}</td></tr>
          </table>
        </div>
      </div>

      <p style="text-align:center;font-size:9px;color:#ccc;margin-top:24px;">VLS System — Sponsor Performance Report</p>
    </div>
  `;

  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "210mm";
  container.innerHTML = html;
  document.body.appendChild(container);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.html(container, {
    callback: (pdf) => {
      document.body.removeChild(container);
      pdf.save(`SponsorReport_${company.name}_${new Date().toISOString().slice(0, 10)}.pdf`);
    },
    x: 0,
    y: 0,
    width: 210,
    windowWidth: 794,
    html2canvas: { scale: 0.264 },
  });
}

// ─── Component ────────────────────────────────────────────────────

export default function SponsorReportTab({ onSave, tenantId }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [videoPlays, setVideoPlays] = useState<VideoPlayRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setCompanies(getStoredCompanies());
    setVideoPlays(tenantId ? getVideoPlaysForTenant(tenantId) : getStoredVideoPlays());
    setAnalytics(tenantId ? getAnalyticsForTenant(tenantId) : getStoredAnalytics());
    setEvents(tenantId ? getEventsForTenant(tenantId) : getStoredEvents());
  }, [tenantId]);

  const company = companies.find((c) => c.id === selectedCompanyId);

  const stats = useMemo(() => {
    if (!selectedCompanyId) return null;
    return calcStats(selectedCompanyId, company, videoPlays, analytics, events);
  }, [selectedCompanyId, company, videoPlays, analytics, events]);

  const handleDownloadPdf = () => {
    if (!company || !stats) return;
    setGenerating(true);
    try {
      generateReportPdf(company, stats);
      onSave(`${company.name} のレポートPDFをダウンロードしました`);
    } finally {
      // jsPDF.html is async but fires callback internally
      setTimeout(() => setGenerating(false), 2000);
    }
  };

  return (
    <div className="space-y-4" data-testid="admin-reports">
      <h2 className="text-lg font-bold text-gray-800">スポンサーレポート</h2>
      <p className="text-xs text-gray-400">
        企業を選択してCM再生数・完了率・属性分布・CPV試算をPDFレポートとしてダウンロードできます。
      </p>

      {/* Company selector */}
      <Card>
        <label className="text-sm font-bold text-gray-600 mb-2 block">対象企業</label>
        <select
          value={selectedCompanyId}
          onChange={(e) => setSelectedCompanyId(e.target.value)}
          className={inputCls + " focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"}
          aria-label="レポート対象企業"
          data-testid="report-company-select"
        >
          <option value="">企業を選択...</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({TIER_LABEL[c.tier]})
            </option>
          ))}
        </select>
      </Card>

      {/* Stats preview */}
      {company && stats && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "総再生数", value: fmtNum(stats.totalPlays), color: "text-blue-600" },
              { label: "完了率", value: fmtPct(stats.completedPlays, stats.totalPlays), color: stats.completionRate >= 0.7 ? "text-green-600" : stats.completionRate >= 0.4 ? "text-yellow-600" : "text-red-500" },
              { label: "平均視聴", value: fmtSec(stats.avgWatchSec), color: "text-indigo-600" },
              { label: "視聴者数", value: fmtNum(stats.audienceCount), color: "text-purple-600" },
            ].map((kpi) => (
              <Card key={kpi.label} className="text-center">
                <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{kpi.label}</p>
              </Card>
            ))}
          </div>

          {/* CM type breakdown */}
          <Card>
            <h3 className="font-bold text-gray-700 text-sm mb-3">CM種別パフォーマンス</h3>
            <div className="overflow-x-auto touch-pan-x">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 text-gray-500">種別</th>
                    <th className="text-center py-2 px-2 text-gray-500">再生数</th>
                    <th className="text-center py-2 px-2 text-gray-500">完了数</th>
                    <th className="text-center py-2 px-2 text-gray-500">完了率</th>
                    <th className="text-center py-2 px-2 text-gray-500">平均視聴</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    { label: "15秒 (Platinum)", ...stats.cm15 },
                    { label: "30秒 (Preview)", ...stats.cm30 },
                    { label: "60秒 (Full)", ...stats.cm60 },
                  ] as { label: string; total: number; completed: number; avgWatch: number }[]).map((row) => (
                    <tr key={row.label} className="border-b border-gray-50">
                      <td className="py-2 px-2 font-medium text-gray-700">{row.label}</td>
                      <td className="py-2 px-2 text-center font-mono">{row.total}</td>
                      <td className="py-2 px-2 text-center font-mono">{row.completed}</td>
                      <td className="py-2 px-2 text-center font-mono">{fmtPct(row.completed, row.total)}</td>
                      <td className="py-2 px-2 text-center font-mono">{fmtSec(row.avgWatch)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Event breakdown */}
          {stats.eventBreakdown.length > 0 && (
            <Card>
              <h3 className="font-bold text-gray-700 text-sm mb-3">イベント別内訳</h3>
              <div className="overflow-x-auto touch-pan-x">
                <table className="w-full text-xs min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 text-gray-500">イベント</th>
                      <th className="text-center py-2 px-2 text-gray-500">再生</th>
                      <th className="text-center py-2 px-2 text-gray-500">完了</th>
                      <th className="text-center py-2 px-2 text-gray-500">完了率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.eventBreakdown.map((eb) => (
                      <tr key={eb.name} className="border-b border-gray-50">
                        <td className="py-2 px-2 font-medium text-gray-700">{eb.name}</td>
                        <td className="py-2 px-2 text-center font-mono">{eb.plays}</td>
                        <td className="py-2 px-2 text-center font-mono">{eb.completed}</td>
                        <td className="py-2 px-2 text-center font-mono">{fmtPct(eb.completed, eb.plays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Audience demographics */}
          <Card>
            <h3 className="font-bold text-gray-700 text-sm mb-3">視聴者属性</h3>
            {stats.ageDist.length > 0 ? (
              <div className="mb-4">
                <p className="text-[10px] text-gray-400 mb-2">年齢分布</p>
                <div className="space-y-1.5">
                  {stats.ageDist.map((d) => {
                    const max = Math.max(...stats.ageDist.map((x) => x.count), 1);
                    return (
                      <div key={d.label} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-14 text-right flex-shrink-0">{d.label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(d.count / max) * 100}%`, backgroundColor: TIER_COLOR[company.tier] }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 w-6">{d.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-4">年齢データなし</p>
            )}
            {stats.interestDist.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-400 mb-2">関心タグ</p>
                <div className="flex flex-wrap gap-1">
                  {stats.interestDist.map((d) => (
                    <span key={d.label} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                      {d.label} ({d.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* CPV estimate */}
          <Card>
            <h3 className="font-bold text-gray-700 text-sm mb-3">CPV試算</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-gray-400">CPV単価 ({TIER_LABEL[company.tier]})</p>
                <p className="text-lg font-bold text-gray-800">{fmtYen(stats.cpvRate)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">完了視聴数</p>
                <p className="text-lg font-bold text-gray-800">{fmtNum(stats.completedPlays)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">推定広告費</p>
                <p className="text-lg font-bold" style={{ color: TIER_COLOR[company.tier] }}>{fmtYen(stats.estimatedCost)}</p>
              </div>
            </div>
          </Card>

          {/* Download PDF button */}
          <div className="flex justify-center">
            <button
              onClick={handleDownloadPdf}
              disabled={generating}
              aria-label="スポンサーレポートPDFをダウンロード"
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-bold text-sm hover:from-blue-600 hover:to-purple-600 disabled:opacity-50 transition-all shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              {generating ? "PDF生成中..." : "レポートPDFをダウンロード"}
            </button>
          </div>
        </>
      )}

      {/* No company selected */}
      {!selectedCompanyId && (
        <Card>
          <p className="text-sm text-gray-400 text-center py-8">
            企業を選択するとパフォーマンスレポートが表示されます
          </p>
        </Card>
      )}
    </div>
  );
}

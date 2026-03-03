"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";

/* ─── Constants ─── */
const TIER_LABEL: Record<string, string> = {
  platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze",
};
const TIER_COLOR: Record<string, string> = {
  platinum: "#6EC6FF", gold: "#FBBF24", silver: "#9CA3AF", bronze: "#F97316",
};
const CPV_RATES: Record<string, number> = {
  platinum: 50, gold: 35, silver: 20, bronze: 10,
};
const CM_TYPE_LABELS: Record<string, string> = { cm15: "15秒CM", cm30: "30秒CM", cm60: "60秒CM" };
const PIE_COLORS = ["#6EC6FF", "#FBBF24", "#9CA3AF", "#F97316"];

function fmtYen(n: number): string { return `¥${n.toLocaleString()}`; }

/* ─── Interfaces ─── */
interface ShareInfo {
  companyId?: string;
  companyName?: string;
  eventId?: string;
  eventName?: string;
  dateFrom?: string;
  dateTo?: string;
  createdAt: number;
  expiresAt: number;
  viewCount: number;
}

interface CompanyData {
  id: string;
  name: string;
  tier: string;
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
  eventId: string;
  stepsCompleted: { cmViewed: boolean; downloaded: boolean };
  surveyAnswers?: Record<string, string[]>;
  timestamp: number;
}

interface EventRec {
  id: string;
  name: string;
}

/* ─── Page ─── */
export default function SponsorReportPage() {
  const params = useParams();
  const token = params.token as string;

  const [status, setStatus] = useState<"loading" | "valid" | "expired" | "error">("loading");
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [videoPlays, setVideoPlays] = useState<VideoPlay[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRec[]>([]);
  const [events, setEvents] = useState<EventRec[]>([]);

  useEffect(() => {
    if (!token) { setStatus("error"); return; }
    fetch(`/api/sponsor-report?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.status === 410) { setStatus("expired"); return; }
        if (!res.ok) { setStatus("error"); return; }
        const json = await res.json();
        setShare(json.share);
        setCompanies(json.companies || []);
        setVideoPlays(json.videoPlays || []);
        setAnalytics(json.analytics || []);
        setEvents(json.events || []);
        setStatus("valid");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  /* ─── ROI Overview ─── */
  const roiOverview = useMemo(() => {
    const totalImpressions = videoPlays.length;
    const totalCompleted = videoPlays.filter((p) => p.completed).length;
    let totalCost = 0;
    for (const p of videoPlays) {
      if (p.completed) {
        const co = companies.find((c) => c.id === p.companyId);
        totalCost += CPV_RATES[co?.tier || "bronze"] || 10;
      }
    }
    const avgCpv = totalCompleted > 0 ? totalCost / totalCompleted : 0;
    const cmViewedCount = analytics.filter((a) => a.stepsCompleted.cmViewed).length;
    const downloadedCount = analytics.filter((a) => a.stepsCompleted.downloaded).length;
    const cvr = cmViewedCount > 0 ? downloadedCount / cmViewedCount : 0;
    return { totalImpressions, totalCompleted, totalCost, avgCpv, cvr };
  }, [videoPlays, analytics, companies]);

  /* ─── Company breakdown ─── */
  const companyData = useMemo(() => {
    const map = new Map<string, { name: string; tier: string; plays: number; completed: number; cost: number; avgWatch: number; totalWatch: number }>();
    for (const p of videoPlays) {
      const co = companies.find((c) => c.id === p.companyId);
      const tier = co?.tier || "bronze";
      if (!map.has(p.companyId)) {
        map.set(p.companyId, { name: p.companyName, tier, plays: 0, completed: 0, cost: 0, avgWatch: 0, totalWatch: 0 });
      }
      const entry = map.get(p.companyId)!;
      entry.plays++;
      entry.totalWatch += p.watchedSeconds;
      if (p.completed) {
        entry.completed++;
        entry.cost += CPV_RATES[tier] || 10;
      }
    }
    return Array.from(map.values())
      .map((d) => ({ ...d, avgWatch: d.plays > 0 ? Math.round(d.totalWatch / d.plays * 10) / 10 : 0 }))
      .sort((a, b) => b.cost - a.cost);
  }, [videoPlays, companies]);

  /* ─── Tier pie ─── */
  const tierPieData = useMemo(() => {
    const tierCosts: Record<string, number> = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
    for (const d of companyData) tierCosts[d.tier] += d.cost;
    return Object.entries(tierCosts)
      .filter(([, v]) => v > 0)
      .map(([tier, value]) => ({ name: TIER_LABEL[tier], value, tier }));
  }, [companyData]);

  /* ─── CM type breakdown ─── */
  const cmTypeData = useMemo(() => {
    return (["cm15", "cm30", "cm60"] as const).map((ct) => {
      const plays = videoPlays.filter((p) => p.cmType === ct);
      const completed = plays.filter((p) => p.completed).length;
      const avgWatch = plays.length > 0 ? Math.round(plays.reduce((s, p) => s + p.watchedSeconds, 0) / plays.length * 10) / 10 : 0;
      return {
        label: CM_TYPE_LABELS[ct],
        再生数: plays.length,
        完了率: plays.length > 0 ? Math.round((completed / plays.length) * 100) : 0,
        平均視聴秒: avgWatch,
      };
    });
  }, [videoPlays]);

  /* ─── Event breakdown ─── */
  const eventData = useMemo(() => {
    const map = new Map<string, { name: string; plays: number; completed: number }>();
    for (const p of videoPlays) {
      if (!map.has(p.eventId)) {
        const ev = events.find((e) => e.id === p.eventId);
        map.set(p.eventId, { name: ev?.name || p.eventId, plays: 0, completed: 0 });
      }
      const entry = map.get(p.eventId)!;
      entry.plays++;
      if (p.completed) entry.completed++;
    }
    return Array.from(map.values())
      .map((d) => ({ ...d, 完了率: d.plays > 0 ? Math.round((d.completed / d.plays) * 100) : 0 }))
      .sort((a, b) => b.plays - a.plays);
  }, [videoPlays, events]);

  /* ─── Period label ─── */
  const periodLabel = share
    ? share.dateFrom || share.dateTo
      ? `${share.dateFrom || "開始"} 〜 ${share.dateTo || "現在"}`
      : "全期間"
    : "";

  const filterLabel = [
    share?.companyName && `企業: ${share.companyName}`,
    share?.eventName && `イベント: ${share.eventName}`,
  ].filter(Boolean).join("  |  ") || "全企業・全イベント";

  /* ─── Render ─── */
  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="text-center" role="status" aria-label="読み込み中">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-sm text-gray-400">レポートを読み込み中...</p>
        </div>
      </main>
    );
  }

  if (status === "expired") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <p className="text-4xl mb-3">⏰</p>
          <h1 className="text-xl font-bold text-gray-800 mb-2">レポートリンクの有効期限切れ</h1>
          <p className="text-sm text-gray-500">このレポートリンクは有効期限（30日間）を過ぎています。</p>
          <p className="text-sm text-gray-500 mt-1">管理者に新しいリンクをリクエストしてください。</p>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <p className="text-4xl mb-3">❌</p>
          <h1 className="text-xl font-bold text-gray-800 mb-2">無効なリンクです</h1>
          <p className="text-sm text-gray-500">このレポートリンクは無効です。URLをご確認ください。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-[#6EC6FF]">VLS</span>
              <span className="text-xs text-gray-400">Sponsor ROI Report</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {filterLabel} | {periodLabel}
            </p>
          </div>
          {share && (
            <div className="text-right text-xs text-gray-400">
              <p>発行日: {new Date(share.createdAt).toLocaleDateString("ja-JP")}</p>
              <p>有効期限: {new Date(share.expiresAt).toLocaleDateString("ja-JP")}</p>
              <p>閲覧: {share.viewCount}回</p>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {/* KPI Cards */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {[
            { label: "総インプレッション", value: roiOverview.totalImpressions.toLocaleString(), icon: "👁", color: "bg-blue-50 text-blue-600" },
            { label: "平均CPV", value: fmtYen(Math.round(roiOverview.avgCpv)), icon: "💰", color: "bg-green-50 text-green-600" },
            { label: "CVR (DL/CM視聴)", value: `${Math.round(roiOverview.cvr * 100)}%`, icon: "📈", color: "bg-purple-50 text-purple-600" },
            { label: "推定広告費合計", value: fmtYen(roiOverview.totalCost), icon: "¥", color: "bg-yellow-50 text-yellow-700" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl shadow-sm p-4 text-center">
              <div className={`inline-flex w-10 h-10 rounded-full items-center justify-center text-lg mb-2 ${s.color}`}>
                {s.icon}
              </div>
              <p className="text-2xl font-bold text-gray-800">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          ))}
        </motion.div>

        {videoPlays.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-sm text-gray-400">再生データがありません。</p>
          </div>
        ) : (
          <>
            {/* Company Performance Table */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <h2 className="text-lg font-bold text-gray-800 mb-3">企業別パフォーマンス</h2>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto touch-pan-x">
                  <table className="w-full text-sm min-w-[600px]" aria-label="企業別パフォーマンステーブル">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left py-3 px-4 text-gray-500 font-medium">企業名</th>
                        <th className="text-center py-3 px-4 text-gray-500 font-medium">Tier</th>
                        <th className="text-center py-3 px-4 text-gray-500 font-medium">再生数</th>
                        <th className="text-center py-3 px-4 text-gray-500 font-medium">完了率</th>
                        <th className="text-center py-3 px-4 text-gray-500 font-medium">平均視聴秒</th>
                        <th className="text-center py-3 px-4 text-gray-500 font-medium">推定費用</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companyData.map((c) => (
                        <tr key={c.name} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-3 px-4 font-medium text-gray-700">{c.name}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${TIER_COLOR[c.tier]}20`, color: TIER_COLOR[c.tier] }}>
                              {TIER_LABEL[c.tier]}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-gray-600">{c.plays}</td>
                          <td className="py-3 px-4 text-center font-mono text-gray-600">{c.plays > 0 ? Math.round((c.completed / c.plays) * 100) : 0}%</td>
                          <td className="py-3 px-4 text-center font-mono text-gray-600">{c.avgWatch}秒</td>
                          <td className="py-3 px-4 text-center font-mono text-gray-600">{fmtYen(c.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Tier Pie */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl shadow-sm p-6">
                <h3 className="font-bold text-gray-700 mb-4">Tier別広告費配分</h3>
                {tierPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={tierPieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                        {tierPieData.map((entry, i) => (
                          <Cell key={entry.tier} fill={TIER_COLOR[entry.tier] || PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip formatter={(v: any) => fmtYen(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">データなし</p>
                )}
              </motion.div>

              {/* CM Type Bar Chart */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-2xl shadow-sm p-6">
                <h3 className="font-bold text-gray-700 mb-4">CM尺別パフォーマンス</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={cmTypeData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="再生数" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="完了率" fill="#34D399" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            </div>

            {/* Event Breakdown (only if multiple events) */}
            {eventData.length > 1 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <h2 className="text-lg font-bold text-gray-800 mb-3">イベント別比較</h2>
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <ResponsiveContainer width="100%" height={Math.max(eventData.length * 50, 200)}>
                    <BarChart data={eventData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="plays" name="再生数" fill="#6EC6FF" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="completed" name="完了数" fill="#34D399" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            )}

            {/* CM Type Detail Table */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <h2 className="text-lg font-bold text-gray-800 mb-3">CM尺別詳細</h2>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto touch-pan-x">
                  <table className="w-full text-sm min-w-[400px]" aria-label="CM尺別詳細テーブル">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left py-3 px-4 text-gray-500 font-medium">CM尺</th>
                        <th className="text-center py-3 px-4 text-gray-500 font-medium">再生数</th>
                        <th className="text-center py-3 px-4 text-gray-500 font-medium">完了率</th>
                        <th className="text-center py-3 px-4 text-gray-500 font-medium">平均視聴秒</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cmTypeData.map((row) => (
                        <tr key={row.label} className="border-b border-gray-50">
                          <td className="py-3 px-4 font-medium text-gray-700">{row.label}</td>
                          <td className="py-3 px-4 text-center font-mono text-gray-600">{row.再生数}</td>
                          <td className="py-3 px-4 text-center font-mono text-gray-600">{row.完了率}%</td>
                          <td className="py-3 px-4 text-center font-mono text-gray-600">{row.平均視聴秒}秒</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </>
        )}

        {/* Footer */}
        <div className="text-center py-6 border-t border-gray-100">
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} VLS System — Event Photo Service</p>
          <p className="text-xs text-gray-300 mt-1">このレポートは自動生成されています。</p>
        </div>
      </div>
    </main>
  );
}

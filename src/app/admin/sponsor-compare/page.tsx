"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, BarChart, Bar,
} from "recharts";
import jsPDF from "jspdf";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredCompanies, getStoredVideoPlays, getStoredAnalytics, getStoredEvents,
  getVideoPlaysForTenant, getAnalyticsForTenant, getEventsForTenant,
} from "@/lib/store";
import { Company, VideoPlayRecord, AnalyticsRecord, EventData } from "@/lib/types";
import { IS_DEMO_MODE } from "@/lib/demo";

// --- Constants ---

const TIER_LABEL: Record<string, string> = {
  platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze",
};
const TIER_COLOR: Record<string, string> = {
  platinum: "#6EC6FF", gold: "#FBBF24", silver: "#9CA3AF", bronze: "#F97316",
};
const CPV_RATES: Record<string, number> = {
  platinum: 50, gold: 35, silver: 20, bronze: 10,
};

function fmtYen(n: number): string { return `¥${n.toLocaleString()}`; }

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Types for computed data ---

interface CompanyStats {
  companyId: string;
  companyName: string;
  tier: string;
  totalPlays: number;
  completedPlays: number;
  completionRate: number;
  cpv: number;
  estimatedCost: number;
}

interface TierStats {
  tier: string;
  label: string;
  completionRate: number;
  avgCpv: number;
  cvr: number;
}

// --- Page ---

export default function SponsorComparePage() {
  const { data: session, status } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [videoPlays, setVideoPlays] = useState<VideoPlayRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);

  const [filterEvent, setFilterEvent] = useState("all");
  const [filterTier, setFilterTier] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const tenantId = session?.user?.tenantId ?? (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ?? null;

  const reload = useCallback(() => {
    if (status !== "authenticated") return;
    setCompanies(getStoredCompanies());
    if (tenantId) {
      setEvents(getEventsForTenant(tenantId));
      setVideoPlays(getVideoPlaysForTenant(tenantId));
      setAnalytics(getAnalyticsForTenant(tenantId));
    } else {
      setEvents(getStoredEvents());
      setVideoPlays(getStoredVideoPlays());
      setAnalytics(getStoredAnalytics());
    }
  }, [status, tenantId]);

  useEffect(() => { reload(); }, [reload]);

  // --- Filtered data ---
  const filtered = useMemo(() => {
    let plays = videoPlays;
    if (filterEvent !== "all") plays = plays.filter((p) => p.eventId === filterEvent);
    if (filterTier !== "all") {
      const tierCompanyIds = new Set(companies.filter((c) => c.tier === filterTier).map((c) => c.id));
      plays = plays.filter((p) => tierCompanyIds.has(p.companyId));
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      plays = plays.filter((p) => p.timestamp >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000;
      plays = plays.filter((p) => p.timestamp < to);
    }
    return plays;
  }, [videoPlays, filterEvent, filterTier, dateFrom, dateTo, companies]);

  const filteredAnalytics = useMemo(() => {
    let recs = analytics;
    if (filterEvent !== "all") recs = recs.filter((a) => a.eventId === filterEvent);
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      recs = recs.filter((a) => a.timestamp >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000;
      recs = recs.filter((a) => a.timestamp < to);
    }
    return recs;
  }, [analytics, filterEvent, dateFrom, dateTo]);

  // --- Company-level stats ---
  const companyStats = useMemo<CompanyStats[]>(() => {
    const map = new Map<string, { totalPlays: number; completedPlays: number }>();
    for (const p of filtered) {
      if (!map.has(p.companyId)) map.set(p.companyId, { totalPlays: 0, completedPlays: 0 });
      const entry = map.get(p.companyId)!;
      entry.totalPlays++;
      if (p.completed) entry.completedPlays++;
    }
    const result: CompanyStats[] = [];
    for (const [companyId, stats] of Array.from(map)) {
      const company = companies.find((c) => c.id === companyId);
      const tier = company?.tier || "bronze";
      const cpv = CPV_RATES[tier] || 10;
      result.push({
        companyId,
        companyName: company?.name || companyId,
        tier,
        totalPlays: stats.totalPlays,
        completedPlays: stats.completedPlays,
        completionRate: stats.totalPlays > 0 ? (stats.completedPlays / stats.totalPlays) * 100 : 0,
        cpv,
        estimatedCost: stats.completedPlays * cpv,
      });
    }
    return result.sort((a, b) => b.totalPlays - a.totalPlays);
  }, [filtered, companies]);

  // --- Scatter data (CPV vs completion rate) ---
  const scatterData = useMemo(() => {
    return companyStats.map((cs) => ({
      name: cs.companyName,
      tier: cs.tier,
      cpv: cs.cpv,
      completionRate: Math.round(cs.completionRate * 10) / 10,
      totalPlays: cs.totalPlays,
      // bubble size: min 60, max 400
      size: Math.max(60, Math.min(400, cs.totalPlays * 8)),
    }));
  }, [companyStats]);

  // --- Heatmap: event x company completion rate ---
  const heatmapData = useMemo(() => {
    const matrix: Record<string, Record<string, { total: number; completed: number }>> = {};
    for (const p of filtered) {
      if (!matrix[p.companyId]) matrix[p.companyId] = {};
      if (!matrix[p.companyId][p.eventId]) matrix[p.companyId][p.eventId] = { total: 0, completed: 0 };
      matrix[p.companyId][p.eventId].total++;
      if (p.completed) matrix[p.companyId][p.eventId].completed++;
    }
    return matrix;
  }, [filtered]);

  const heatmapCompanyIds = useMemo(() => Object.keys(heatmapData), [heatmapData]);
  const heatmapEventIds = useMemo(() => {
    const ids = new Set<string>();
    for (const eventMap of Object.values(heatmapData)) {
      for (const eventId of Object.keys(eventMap)) ids.add(eventId);
    }
    return Array.from(ids);
  }, [heatmapData]);

  // --- Tier comparison ---
  const tierComparisonData = useMemo<TierStats[]>(() => {
    const tiers = ["platinum", "gold", "silver", "bronze"];
    const cmViewedCount = filteredAnalytics.filter((a) => a.stepsCompleted.cmViewed).length;
    const downloadedCount = filteredAnalytics.filter((a) => a.stepsCompleted.downloaded).length;
    const globalCvr = cmViewedCount > 0 ? (downloadedCount / cmViewedCount) * 100 : 0;

    return tiers.map((tier) => {
      const tierStats = companyStats.filter((cs) => cs.tier === tier);
      const totalPlays = tierStats.reduce((s, cs) => s + cs.totalPlays, 0);
      const completedPlays = tierStats.reduce((s, cs) => s + cs.completedPlays, 0);
      const completionRate = totalPlays > 0 ? (completedPlays / totalPlays) * 100 : 0;
      const avgCpv = CPV_RATES[tier] || 10;
      // Per-tier CVR approximation: weight globalCvr by tier's completion rate ratio
      const cvr = totalPlays > 0 ? globalCvr * (completionRate / 100) : 0;

      return {
        tier,
        label: TIER_LABEL[tier],
        completionRate: Math.round(completionRate * 10) / 10,
        avgCpv,
        cvr: Math.round(cvr * 10) / 10,
      };
    });
  }, [companyStats, filteredAnalytics]);

  const tierBarData = useMemo(() => {
    return tierComparisonData.map((t) => ({
      name: t.label,
      完了率: t.completionRate,
      平均CPV: t.avgCpv,
      CVR: t.cvr,
    }));
  }, [tierComparisonData]);

  // --- Period comparison ---
  const periodKPI = useMemo(() => {
    if (!dateFrom || !dateTo) return null;
    const totalPlays = filtered.length;
    const completedPlays = filtered.filter((p) => p.completed).length;
    const completionRate = totalPlays > 0 ? (completedPlays / totalPlays) * 100 : 0;
    let totalCost = 0;
    for (const p of filtered) {
      if (!p.completed) continue;
      const company = companies.find((c) => c.id === p.companyId);
      totalCost += CPV_RATES[company?.tier || "bronze"] || 10;
    }
    const cmViewedCount = filteredAnalytics.filter((a) => a.stepsCompleted.cmViewed).length;
    const downloadedCount = filteredAnalytics.filter((a) => a.stepsCompleted.downloaded).length;
    const cvr = cmViewedCount > 0 ? (downloadedCount / cmViewedCount) * 100 : 0;
    return {
      period: `${dateFrom} ~ ${dateTo}`,
      totalPlays,
      completedPlays,
      completionRate: Math.round(completionRate * 10) / 10,
      totalCost,
      cvr: Math.round(cvr * 10) / 10,
    };
  }, [filtered, filteredAnalytics, dateFrom, dateTo, companies]);

  // --- CSV Export ---
  const handleCsvExport = useCallback(() => {
    const bom = "\uFEFF";
    const header = "企業名,Tier,総再生数,完了数,完了率(%),CPV(¥),推定広告費(¥)\n";
    const rows = companyStats.map((cs) =>
      `${cs.companyName},${TIER_LABEL[cs.tier]},${cs.totalPlays},${cs.completedPlays},${Math.round(cs.completionRate * 10) / 10},${cs.cpv},${cs.estimatedCost}`
    ).join("\n");
    const csv = bom + header + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `スポンサー比較_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [companyStats]);

  // --- PDF Export ---
  const handlePdfExport = useCallback(() => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFont("helvetica");
    doc.setFontSize(16);
    doc.text("Sponsor Comparison Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString("ja-JP")}`, 14, 28);

    // Table header
    const startY = 38;
    const colWidths = [60, 25, 25, 25, 30, 25, 35];
    const headers = ["Company", "Tier", "Plays", "Completed", "Rate(%)", "CPV", "Est.Cost"];
    let y = startY;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    let x = 14;
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x, y);
      x += colWidths[i];
    }
    y += 6;
    doc.setFont("helvetica", "normal");

    for (const cs of companyStats) {
      if (y > 190) {
        doc.addPage();
        y = 20;
      }
      x = 14;
      const row = [
        cs.companyName.length > 20 ? cs.companyName.slice(0, 20) + "..." : cs.companyName,
        TIER_LABEL[cs.tier],
        String(cs.totalPlays),
        String(cs.completedPlays),
        String(Math.round(cs.completionRate * 10) / 10),
        fmtYen(cs.cpv),
        fmtYen(cs.estimatedCost),
      ];
      for (let i = 0; i < row.length; i++) {
        doc.text(row[i], x, y);
        x += colWidths[i];
      }
      y += 5;
    }

    doc.save(`スポンサー比較_${todayStr()}.pdf`);
  }, [companyStats]);

  // --- Loading ---
  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">スポンサー比較を読み込み中...</p>
        </div>
      </main>
    );
  }

  const inputCls = "text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] focus:border-[#6EC6FF] dark:bg-gray-700 dark:text-gray-100";

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title={IS_DEMO_MODE ? "スポンサー効果比較 (Demo)" : "スポンサー効果比較"}
        badge={`${companyStats.length}社`}
        onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* ===== 1. Filters ===== */}
        <div className="flex flex-wrap gap-3 items-end">
          <select
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
            aria-label="イベントフィルター"
            className={inputCls}
          >
            <option value="all">全イベント</option>
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>{evt.name}</option>
            ))}
          </select>

          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            aria-label="Tierフィルター"
            className={inputCls}
          >
            <option value="all">全Tier</option>
            <option value="platinum">Platinum</option>
            <option value="gold">Gold</option>
            <option value="silver">Silver</option>
            <option value="bronze">Bronze</option>
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="開始日"
            className={inputCls}
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="終了日"
            className={inputCls}
          />

          <button
            onClick={handleCsvExport}
            aria-label="CSVエクスポート"
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold rounded-xl transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
          >
            CSVエクスポート
          </button>
          <button
            onClick={handlePdfExport}
            aria-label="PDFエクスポート"
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
          >
            PDFエクスポート
          </button>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              再生データがありません。フィルター条件を変更するか、ユーザーがCMを視聴するとデータが表示されます。
            </p>
          </Card>
        ) : (
          <>
            {/* ===== 2. Scatter Plot — CPV vs 完了率 ===== */}
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">CPV vs 完了率 (企業バブル)</h2>

            <Card>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="cpv"
                    name="CPV"
                    unit="¥"
                    tick={{ fontSize: 11 }}
                    label={{ value: "CPV (¥)", position: "insideBottom", offset: -5, fontSize: 12 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="completionRate"
                    name="完了率"
                    unit="%"
                    tick={{ fontSize: 11 }}
                    label={{ value: "完了率 (%)", angle: -90, position: "insideLeft", fontSize: 12 }}
                  />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const d = payload[0].payload as any;
                      return (
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl p-3 shadow-lg text-xs">
                          <p className="font-bold text-gray-800 dark:text-gray-100">{d.name}</p>
                          <p className="text-gray-500 dark:text-gray-400">Tier: {TIER_LABEL[d.tier]}</p>
                          <p className="text-gray-500 dark:text-gray-400">CPV: {fmtYen(d.cpv)}</p>
                          <p className="text-gray-500 dark:text-gray-400">完了率: {d.completionRate}%</p>
                          <p className="text-gray-500 dark:text-gray-400">総再生数: {d.totalPlays}</p>
                        </div>
                      );
                    }}
                  />
                  <Legend content={() => (
                    <div className="flex justify-center gap-4 mt-2">
                      {Object.entries(TIER_LABEL).map(([key, label]) => (
                        <span key={key} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: TIER_COLOR[key] }} />
                          {label}
                        </span>
                      ))}
                    </div>
                  )} />
                  <Scatter data={scatterData} fill="#6EC6FF">
                    {scatterData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={TIER_COLOR[entry.tier] || "#9CA3AF"}
                        r={Math.max(6, Math.min(20, entry.totalPlays * 0.8))}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </Card>

            {/* ===== 3. Heatmap — Event x Company 完了率 ===== */}
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">イベント x 企業 完了率ヒートマップ</h2>

            <Card>
              <div className="overflow-x-auto touch-pan-x">
                <table className="w-full text-xs min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-600">
                      <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10">企業名</th>
                      {heatmapEventIds.map((eventId) => {
                        const evt = events.find((e) => e.id === eventId);
                        return (
                          <th key={eventId} className="text-center py-2 px-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {evt ? (evt.name.length > 12 ? evt.name.slice(0, 12) + "..." : evt.name) : eventId}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapCompanyIds.map((companyId) => {
                      const company = companies.find((c) => c.id === companyId);
                      const companyName = company?.name || companyId;
                      return (
                        <tr key={companyId} className="border-b border-gray-50 dark:border-gray-700">
                          <td className="py-2 px-2 font-medium text-gray-700 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-800 z-10 whitespace-nowrap">
                            {companyName.length > 15 ? companyName.slice(0, 15) + "..." : companyName}
                          </td>
                          {heatmapEventIds.map((eventId) => {
                            const cell = heatmapData[companyId]?.[eventId];
                            if (!cell || cell.total === 0) {
                              return (
                                <td key={eventId} className="py-2 px-2 text-center text-gray-300 dark:text-gray-600">
                                  —
                                </td>
                              );
                            }
                            const rate = Math.round((cell.completed / cell.total) * 100);
                            return (
                              <td
                                key={eventId}
                                className="py-2 px-2 text-center font-mono font-medium"
                                style={{ backgroundColor: `rgba(34, 197, 94, ${rate / 100})` }}
                              >
                                <span className={rate > 50 ? "text-white" : "text-gray-700"}>{rate}%</span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* ===== 4. Tier Comparison Bar Chart ===== */}
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Tier別比較</h2>

            <Card>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={tierBarData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="完了率" fill="#6EC6FF" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="平均CPV" fill="#FBBF24" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="CVR" fill="#A78BFA" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Tier summary table */}
              <div className="overflow-x-auto touch-pan-x mt-4">
                <table className="w-full text-xs min-w-[400px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-600">
                      <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400">Tier</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">完了率</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">平均CPV</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">CVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tierComparisonData.map((row) => (
                      <tr key={row.tier} className="border-b border-gray-50 dark:border-gray-700">
                        <td className="py-2 px-2 font-medium text-gray-700 dark:text-gray-200">
                          <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: TIER_COLOR[row.tier] }} />
                          {row.label}
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{row.completionRate}%</td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{fmtYen(row.avgCpv)}</td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{row.cvr}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* ===== 5. Period Comparison Table ===== */}
            {periodKPI && (
              <>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">期間KPI</h2>

                <Card>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                    期間: {periodKPI.period}
                  </p>
                  <div className="overflow-x-auto touch-pan-x">
                    <table className="w-full text-xs min-w-[400px]">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-600">
                          <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400">指標</th>
                          <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">値</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: "総再生数", value: periodKPI.totalPlays.toLocaleString() },
                          { label: "完了数", value: periodKPI.completedPlays.toLocaleString() },
                          { label: "完了率", value: `${periodKPI.completionRate}%` },
                          { label: "推定広告費", value: fmtYen(periodKPI.totalCost) },
                          { label: "CVR (DL/CM視聴)", value: `${periodKPI.cvr}%` },
                        ].map((row) => (
                          <tr key={row.label} className="border-b border-gray-50 dark:border-gray-700">
                            <td className="py-2 px-2 font-medium text-gray-700 dark:text-gray-200">{row.label}</td>
                            <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}

            {/* ===== Company detail table ===== */}
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">企業別詳細</h2>

            <Card>
              <div className="overflow-x-auto touch-pan-x">
                <table className="w-full text-xs min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-600">
                      <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400">企業名</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">Tier</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">総再生数</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">完了数</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">完了率(%)</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">CPV(¥)</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">推定広告費(¥)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companyStats.map((cs) => (
                      <tr key={cs.companyId} className="border-b border-gray-50 dark:border-gray-700">
                        <td className="py-2 px-2 font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
                          <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: TIER_COLOR[cs.tier] }} />
                          {cs.companyName.length > 18 ? cs.companyName.slice(0, 18) + "..." : cs.companyName}
                        </td>
                        <td className="py-2 px-2 text-center text-gray-600 dark:text-gray-300">{TIER_LABEL[cs.tier]}</td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{cs.totalPlays}</td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{cs.completedPlays}</td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{Math.round(cs.completionRate * 10) / 10}%</td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{fmtYen(cs.cpv)}</td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{fmtYen(cs.estimatedCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

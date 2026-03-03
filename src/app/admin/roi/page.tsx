"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredCompanies, getStoredVideoPlays, getStoredAnalytics, getStoredEvents,
  getVideoPlaysForTenant, getAnalyticsForTenant, getEventsForTenant,
} from "@/lib/store";
import { Company, VideoPlayRecord, AnalyticsRecord, EventData } from "@/lib/types";
import { IS_DEMO_MODE } from "@/lib/demo";
import { csrfHeaders } from "@/lib/csrf";

// --- Constants (shared with SponsorReportTab) ---

const TIER_LABEL: Record<string, string> = {
  platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze",
};
const TIER_COLOR: Record<string, string> = {
  platinum: "#6EC6FF", gold: "#FBBF24", silver: "#9CA3AF", bronze: "#F97316",
};
const CPV_RATES: Record<string, number> = {
  platinum: 50, gold: 35, silver: 20, bronze: 10,
};
const AGE_LABELS: Record<string, string> = {
  age_0_3: "0~3歳", age_4_6: "4~6歳", age_7_9: "7~9歳",
  age_10_12: "10~12歳", age_13_plus: "13歳以上",
};
const INTEREST_LABELS: Record<string, string> = {
  education: "教育", sports: "スポーツ", food: "食", travel: "旅行",
  technology: "テクノロジー", art: "アート", nature: "自然",
  cram_school: "学習塾", lessons: "習い事", food_product: "食品",
  travel_service: "旅行サービス", smartphone: "スマホ", camera: "カメラ", insurance: "保険",
};
const PIE_COLORS = ["#6EC6FF", "#FBBF24", "#9CA3AF", "#F97316"];
const CM_TYPE_LABELS: Record<string, string> = { cm15: "15秒CM", cm30: "30秒CM", cm60: "60秒CM" };
const CM_TYPE_COLORS: Record<string, string> = { cm15: "#60A5FA", cm30: "#34D399", cm60: "#A78BFA" };

function fmtYen(n: number): string { return `¥${n.toLocaleString()}`; }

// --- Page ---

export default function RoiPage() {
  const { data: session, status } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [videoPlays, setVideoPlays] = useState<VideoPlayRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);

  const [filterEvent, setFilterEvent] = useState("all");
  const [filterCompany, setFilterCompany] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Report email
  const [reportEmail, setReportEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

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
    if (filterCompany !== "all") plays = plays.filter((p) => p.companyId === filterCompany);
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      plays = plays.filter((p) => p.timestamp >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000; // end of day
      plays = plays.filter((p) => p.timestamp < to);
    }
    return plays;
  }, [videoPlays, filterEvent, filterCompany, dateFrom, dateTo]);

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

  // --- A. ROI Overview ---
  const roiOverview = useMemo(() => {
    const totalImpressions = filtered.length;
    const totalCompleted = filtered.filter((p) => p.completed).length;

    // Estimated ad cost
    let totalCost = 0;
    for (const p of filtered) {
      const company = companies.find((c) => c.id === p.companyId);
      if (p.completed) {
        totalCost += CPV_RATES[company?.tier || "bronze"] || 10;
      }
    }

    // Average CPV
    const avgCpv = totalCompleted > 0 ? totalCost / totalCompleted : 0;

    // CVR: downloaded / cmViewed
    const cmViewedCount = filteredAnalytics.filter((a) => a.stepsCompleted.cmViewed).length;
    const downloadedCount = filteredAnalytics.filter((a) => a.stepsCompleted.downloaded).length;
    const cvr = cmViewedCount > 0 ? downloadedCount / cmViewedCount : 0;

    return { totalImpressions, totalCompleted, totalCost, avgCpv, cvr, cmViewedCount, downloadedCount };
  }, [filtered, filteredAnalytics, companies]);

  // Company-level CPV data for bar chart
  const companyCpvData = useMemo(() => {
    const map = new Map<string, { name: string; tier: string; cpv: number; completed: number; cost: number }>();
    for (const p of filtered) {
      if (!p.completed) continue;
      const company = companies.find((c) => c.id === p.companyId);
      const tier = company?.tier || "bronze";
      if (!map.has(p.companyId)) {
        map.set(p.companyId, { name: p.companyName, tier, cpv: CPV_RATES[tier] || 10, completed: 0, cost: 0 });
      }
      const entry = map.get(p.companyId)!;
      entry.completed++;
      entry.cost += CPV_RATES[tier] || 10;
    }
    return Array.from(map.values())
      .sort((a, b) => b.cost - a.cost)
      .map((d) => ({ name: d.name.length > 10 ? d.name.slice(0, 10) + "…" : d.name, CPV: d.cpv, 広告費: d.cost, tier: d.tier }));
  }, [filtered, companies]);

  // Tier pie data
  const tierPieData = useMemo(() => {
    const tierCosts: Record<string, number> = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
    for (const p of filtered) {
      if (!p.completed) continue;
      const company = companies.find((c) => c.id === p.companyId);
      const tier = company?.tier || "bronze";
      tierCosts[tier] += CPV_RATES[tier] || 10;
    }
    return Object.entries(tierCosts)
      .filter(([, v]) => v > 0)
      .map(([tier, value]) => ({ name: TIER_LABEL[tier], value, tier }));
  }, [filtered, companies]);

  // --- B. Attribute Analysis ---
  const ageRadarData = useMemo(() => {
    const ageKeys = Object.keys(AGE_LABELS);
    const ageCmViewed: Record<string, number> = {};
    const ageCmCompleted: Record<string, number> = {};
    for (const k of ageKeys) { ageCmViewed[k] = 0; ageCmCompleted[k] = 0; }

    for (const rec of filteredAnalytics) {
      if (!rec.surveyAnswers) continue;
      const userAges = new Set<string>();
      for (const tags of Object.values(rec.surveyAnswers)) {
        for (const tag of tags) {
          if (tag.startsWith("age_")) userAges.add(tag);
        }
      }
      Array.from(userAges).forEach((age) => {
        if (rec.stepsCompleted.cmViewed) ageCmViewed[age] = (ageCmViewed[age] || 0) + 1;
        if (rec.stepsCompleted.downloaded) ageCmCompleted[age] = (ageCmCompleted[age] || 0) + 1;
      });
    }

    return ageKeys.map((k) => ({
      label: AGE_LABELS[k],
      完了率: ageCmViewed[k] > 0 ? Math.round((ageCmCompleted[k] / ageCmViewed[k]) * 100) : 0,
    }));
  }, [filteredAnalytics]);

  const interestCvrData = useMemo(() => {
    const interestKeys = Object.keys(INTEREST_LABELS);
    const iViewed: Record<string, number> = {};
    const iCompleted: Record<string, number> = {};
    for (const k of interestKeys) { iViewed[k] = 0; iCompleted[k] = 0; }

    for (const rec of filteredAnalytics) {
      if (!rec.surveyAnswers) continue;
      const userTags = new Set<string>();
      for (const tags of Object.values(rec.surveyAnswers)) {
        for (const tag of tags) {
          if (!tag.startsWith("age_")) userTags.add(tag);
        }
      }
      Array.from(userTags).forEach((tag) => {
        if (rec.stepsCompleted.cmViewed) iViewed[tag] = (iViewed[tag] || 0) + 1;
        if (rec.stepsCompleted.downloaded) iCompleted[tag] = (iCompleted[tag] || 0) + 1;
      });
    }

    return interestKeys
      .map((k) => ({
        tag: INTEREST_LABELS[k] || k,
        CVR: iViewed[k] > 0 ? Math.round((iCompleted[k] / iViewed[k]) * 100) : 0,
        件数: iViewed[k],
      }))
      .sort((a, b) => b.CVR - a.CVR)
      .slice(0, 8);
  }, [filteredAnalytics]);

  // --- C. A/B Test ---
  const abTestData = useMemo(() => {
    const cmTypes = ["cm15", "cm30", "cm60"] as const;
    return cmTypes.map((ct) => {
      const plays = filtered.filter((p) => p.cmType === ct);
      const completed = plays.filter((p) => p.completed).length;
      const avgWatch = plays.length > 0 ? plays.reduce((s, p) => s + p.watchedSeconds, 0) / plays.length : 0;

      const totalSamples = plays.length;
      const completionRate = plays.length > 0 ? completed / plays.length : 0;

      return {
        label: CM_TYPE_LABELS[ct],
        cmType: ct,
        サンプル数: totalSamples,
        完了率: Math.round(completionRate * 100),
        平均視聴秒: Math.round(avgWatch * 10) / 10,
        CVR: Math.round(roiOverview.cvr * completionRate * 100), // weighted estimate
      };
    });
  }, [filtered, roiOverview.cvr]);

  // A/B per-company detail (for selected company)
  const abCompanyData = useMemo(() => {
    if (filterCompany === "all") return null;
    const cmTypes = ["cm15", "cm30", "cm60"] as const;
    return cmTypes.map((ct) => {
      const plays = filtered.filter((p) => p.cmType === ct && p.companyId === filterCompany);
      const completed = plays.filter((p) => p.completed).length;
      const avgWatch = plays.length > 0 ? plays.reduce((s, p) => s + p.watchedSeconds, 0) / plays.length : 0;
      return {
        label: CM_TYPE_LABELS[ct],
        サンプル数: plays.length,
        完了率: plays.length > 0 ? Math.round((completed / plays.length) * 100) : 0,
        平均視聴秒: Math.round(avgWatch * 10) / 10,
      };
    });
  }, [filtered, filterCompany]);

  // --- Report send ---
  const handleSendReport = async () => {
    if (!reportEmail || sending) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/roi-report", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          email: reportEmail,
          companyId: filterCompany !== "all" ? filterCompany : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSendResult({ ok: true, msg: `送信完了 (${data.method})` });
      } else {
        setSendResult({ ok: false, msg: data.error || "送信失敗" });
      }
    } catch {
      setSendResult({ ok: false, msg: "ネットワークエラー" });
    } finally {
      setSending(false);
    }
  };

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
          <p className="text-sm text-gray-400 dark:text-gray-500">ROIダッシュボードを読み込み中...</p>
        </div>
      </main>
    );
  }

  const inputCls = "text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] focus:border-[#6EC6FF] dark:bg-gray-700 dark:text-gray-100";

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title={IS_DEMO_MODE ? "ROIダッシュボード (Demo)" : "ROIダッシュボード"}
        badge={`${filtered.length}再生`}
        onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)} aria-label="イベントフィルター" className={inputCls}>
            <option value="all">全イベント</option>
            {events.map((evt) => (<option key={evt.id} value={evt.id}>{evt.name}</option>))}
          </select>
          <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} aria-label="企業フィルター" className={inputCls}>
            <option value="all">全企業</option>
            {companies.map((c) => (<option key={c.id} value={c.id}>{c.name} ({TIER_LABEL[c.tier]})</option>))}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="開始日" className={inputCls} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="終了日" className={inputCls} />
        </div>

        {/* ===== A. ROI Overview ===== */}
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">ROI概要</h2>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "総インプレッション", value: roiOverview.totalImpressions.toLocaleString(), icon: "👁", color: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
            { label: "平均CPV", value: fmtYen(Math.round(roiOverview.avgCpv)), icon: "💰", color: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
            { label: "CVR (DL/CM視聴)", value: `${Math.round(roiOverview.cvr * 100)}%`, icon: "📈", color: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
            { label: "推定広告費合計", value: fmtYen(roiOverview.totalCost), icon: "¥", color: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
          ].map((s) => (
            <Card key={s.label} className="text-center">
              <div className={`inline-flex w-10 h-10 rounded-full items-center justify-center text-lg mb-2 ${s.color}`}>
                {s.icon}
              </div>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{s.value}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{s.label}</p>
            </Card>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              再生データがありません。フィルター条件を変更するか、ユーザーがCMを視聴するとデータが表示されます。
            </p>
          </Card>
        ) : (
          <>
            {/* CPV Bar Chart + Tier Pie */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">企業別CPV比較</h3>
                <ResponsiveContainer width="100%" height={Math.max(companyCpvData.length * 40, 200)}>
                  <BarChart data={companyCpvData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `¥${v.toLocaleString()}`} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                    { /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ }
                    <Tooltip formatter={(v: any) => fmtYen(Number(v))} />
                    <Legend />
                    <Bar dataKey="広告費" fill="#6EC6FF" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">Tier別広告費配分</h3>
                {tierPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={tierPieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                        {tierPieData.map((entry, i) => (
                          <Cell key={entry.tier} fill={TIER_COLOR[entry.tier] || PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      { /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ }
                      <Tooltip formatter={(v: any) => fmtYen(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">完了視聴データなし</p>
                )}
              </Card>
            </div>

            {/* ===== B. Attribute Analysis ===== */}
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">属性別効果分析</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">年齢層別CM完了率</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={ageRadarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar name="完了率" dataKey="完了率" stroke="#6EC6FF" fill="#6EC6FF" fillOpacity={0.3} />
                    { /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ }
                    <Tooltip formatter={(v: any) => `${v}%`} />
                  </RadarChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">関心タグ別CVR (上位8)</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={interestCvrData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tag" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    { /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ }
                    <Tooltip formatter={(v: any, name: any) => name === "CVR" ? `${v}%` : v} />
                    <Legend />
                    <Bar dataKey="CVR" fill="#A78BFA" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* ===== C. A/B Test — CM Duration Comparison ===== */}
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">A/Bテスト — CM尺比較</h2>

            <Card>
              <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">CM尺別パフォーマンス</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={abTestData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="完了率" fill={CM_TYPE_COLORS.cm15} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="平均視聴秒" fill={CM_TYPE_COLORS.cm30} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="CVR" fill={CM_TYPE_COLORS.cm60} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Summary table */}
              <div className="overflow-x-auto touch-pan-x mt-4">
                <table className="w-full text-xs min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-600">
                      <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400">CM尺</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">サンプル数</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">完了率</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">平均視聴秒</th>
                      <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">CVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abTestData.map((row) => (
                      <tr key={row.label} className="border-b border-gray-50 dark:border-gray-700">
                        <td className="py-2 px-2 font-medium text-gray-700 dark:text-gray-200">{row.label}</td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{row.サンプル数}</td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{row.完了率}%</td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{row.平均視聴秒}秒</td>
                        <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{row.CVR}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Per-company A/B detail */}
            {abCompanyData && (
              <Card>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">
                  {companies.find((c) => c.id === filterCompany)?.name || filterCompany} — CM尺別内訳
                </h3>
                <div className="overflow-x-auto touch-pan-x">
                  <table className="w-full text-xs min-w-[400px]">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-600">
                        <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400">CM尺</th>
                        <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">サンプル数</th>
                        <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">完了率</th>
                        <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">平均視聴秒</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abCompanyData.map((row) => (
                        <tr key={row.label} className="border-b border-gray-50 dark:border-gray-700">
                          <td className="py-2 px-2 font-medium text-gray-700 dark:text-gray-200">{row.label}</td>
                          <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{row.サンプル数}</td>
                          <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{row.完了率}%</td>
                          <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{row.平均視聴秒}秒</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ===== D. Monthly Report ===== */}
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">月次レポート送信</h2>

            <Card>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                ROIサマリーをメールで送信します。現在のフィルター条件が適用されます。
              </p>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="roi-email" className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">送信先メールアドレス</label>
                  <input
                    id="roi-email"
                    type="email"
                    value={reportEmail}
                    onChange={(e) => setReportEmail(e.target.value)}
                    placeholder="sponsor@example.com"
                    aria-label="レポート送信先メールアドレス"
                    className={inputCls + " w-full"}
                  />
                </div>
                <button
                  onClick={handleSendReport}
                  disabled={sending || !reportEmail}
                  aria-label="ROIレポートを送信"
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-bold text-sm hover:from-blue-600 hover:to-purple-600 disabled:opacity-50 transition-all shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                >
                  {sending ? "送信中..." : "レポートを送信"}
                </button>
              </div>
              {sendResult && (
                <p className={`text-xs mt-2 ${sendResult.ok ? "text-green-500" : "text-red-500"}`} role="status" aria-live="polite">
                  {sendResult.msg}
                </p>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

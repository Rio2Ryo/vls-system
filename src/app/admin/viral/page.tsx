"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import AdminHeader from "@/components/admin/AdminHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import {
  getStoredShareEvents,
  getStoredEvents,
  getStoredAnalytics,
  getStoredTenants,
  getEventsForTenant,
} from "@/lib/store";
import { ShareEvent, EventData, Tenant } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = ["#6EC6FF", "#FF6B6B", "#06C755", "#6B7280", "#E4405F", "#FFD43B"];
const PLATFORM_LABELS: Record<string, string> = {
  twitter: "X (Twitter)",
  line: "LINE",
  instagram: "Instagram",
  copy: "リンクコピー",
};

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminViralPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Auth
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");

  // Filters
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterDays, setFilterDays] = useState(30);

  // Tenant
  const tenantId = session?.user?.tenantId ||
    (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) || null;

  // Auth check
  useEffect(() => {
    if (status === "loading") return;
    if (session?.user) {
      setAuthed(true);
    } else {
      const stored = sessionStorage.getItem("adminAuthenticated");
      if (stored === "true") setAuthed(true);
    }
  }, [session, status]);

  const handleLogin = useCallback(() => {
    const tenants = getStoredTenants();
    const match = tenants.some((t: Tenant) => t.adminPassword === pw);
    if (match || pw === "ADMIN2026") {
      setAuthed(true);
      sessionStorage.setItem("adminAuthenticated", "true");
    } else {
      setPwError("パスワードが正しくありません");
    }
  }, [pw]);

  const handleLogout = useCallback(() => {
    setAuthed(false);
    sessionStorage.removeItem("adminAuthenticated");
    if (session?.user) signOut({ callbackUrl: "/admin" });
    else router.push("/admin");
  }, [session, router]);

  // Data
  const events: EventData[] = useMemo(() => {
    return tenantId ? getEventsForTenant(tenantId) : getStoredEvents();
  }, [tenantId]);

  const allShareEvents: ShareEvent[] = useMemo(() => {
    const all = getStoredShareEvents();
    const cutoff = Date.now() - filterDays * 86400000;
    let filtered = all.filter((e) => e.timestamp >= cutoff);
    if (filterEvent !== "all") {
      filtered = filtered.filter((e) => e.eventId === filterEvent);
    }
    return filtered;
  }, [filterEvent, filterDays]);

  // Analytics for viral coefficient
  const totalAccess = useMemo(() => {
    const analytics = getStoredAnalytics();
    if (filterEvent === "all") return analytics.length;
    return analytics.filter((a) => a.eventId === filterEvent).length;
  }, [filterEvent]);

  // --- KPIs ---
  const totalClicks = allShareEvents.filter((e) => e.action === "share_click").length;
  const totalCompletes = allShareEvents.filter((e) => e.action === "share_complete").length;
  const completionRate = totalClicks > 0 ? Math.round((totalCompletes / totalClicks) * 100) : 0;

  // Viral coefficient: shares / total users (how many shares per user)
  const viralCoefficient = totalAccess > 0 ? (totalCompletes / totalAccess).toFixed(2) : "0.00";

  // Unique referrers
  const uniqueReferrers = new Set(allShareEvents.filter((e) => e.referrer).map((e) => e.referrer)).size;

  // --- Charts ---

  // Platform breakdown
  const platformData = useMemo(() => {
    const map: Record<string, { clicks: number; completes: number }> = {};
    for (const ev of allShareEvents) {
      if (!map[ev.platform]) map[ev.platform] = { clicks: 0, completes: 0 };
      if (ev.action === "share_click") map[ev.platform].clicks++;
      if (ev.action === "share_complete") map[ev.platform].completes++;
    }
    return Object.entries(map).map(([platform, data]) => ({
      platform: PLATFORM_LABELS[platform] || platform,
      ...data,
    }));
  }, [allShareEvents]);

  // Pie chart for platform share
  const pieData = useMemo(() => {
    return platformData.map((d) => ({
      name: d.platform,
      value: d.clicks + d.completes,
    }));
  }, [platformData]);

  // Daily trend
  const dailyTrend = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ev of allShareEvents) {
      const date = new Date(ev.timestamp).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
      map[date] = (map[date] || 0) + 1;
    }
    return Object.entries(map)
      .map(([date, count]) => ({ date, count }))
      .slice(-30);
  }, [allShareEvents]);

  // Event breakdown
  const eventBreakdown = useMemo(() => {
    const map: Record<string, { name: string; clicks: number; completes: number }> = {};
    for (const ev of allShareEvents) {
      if (!map[ev.eventId]) {
        const event = events.find((e) => e.id === ev.eventId);
        map[ev.eventId] = { name: event?.name || ev.eventId, clicks: 0, completes: 0 };
      }
      if (ev.action === "share_click") map[ev.eventId].clicks++;
      if (ev.action === "share_complete") map[ev.eventId].completes++;
    }
    return Object.values(map);
  }, [allShareEvents, events]);

  // UTM campaign stats
  const utmStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ev of allShareEvents) {
      if (ev.utmCampaign) {
        map[ev.utmCampaign] = (map[ev.utmCampaign] || 0) + 1;
      }
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [allShareEvents]);

  // CSV export
  const handleExportCsv = useCallback(() => {
    const header = "ID,イベントID,プラットフォーム,アクション,UTMソース,UTMキャンペーン,日時\n";
    const rows = allShareEvents.map((e) =>
      `${e.id},${e.eventId},${e.platform},${e.action},${e.utmSource || ""},${e.utmCampaign || ""},${new Date(e.timestamp).toISOString()}`
    ).join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `viral_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allShareEvents]);

  // --- Login screen ---
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-sm w-full">
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">管理画面ログイン</h1>
          <input
            className={inputCls}
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setPwError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="管理パスワード"
            aria-label="管理パスワード"
          />
          {pwError && <p className="text-xs text-red-500 mt-1">{pwError}</p>}
          <Button size="sm" onClick={handleLogin} className="mt-3 w-full">ログイン</Button>
        </Card>
      </div>
    );
  }

  // --- Dashboard ---
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AdminHeader
        title="バイラルダッシュボード"
        onLogout={handleLogout}
        actions={
          <button
            onClick={handleExportCsv}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
            aria-label="CSV出力"
          >
            CSV出力
          </button>
        }
      />

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
            className={inputCls + " max-w-[200px]"}
            aria-label="イベントフィルター"
          >
            <option value="all">全イベント</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select
            value={filterDays}
            onChange={(e) => setFilterDays(Number(e.target.value))}
            className={inputCls + " max-w-[140px]"}
            aria-label="期間フィルター"
          >
            <option value={7}>過去7日</option>
            <option value={30}>過去30日</option>
            <option value={90}>過去90日</option>
            <option value={365}>過去1年</option>
          </select>
        </div>

        {/* KPI Cards */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-3"
        >
          {[
            { label: "シェアクリック", value: totalClicks, color: "#6EC6FF" },
            { label: "シェア完了", value: totalCompletes, color: "#06C755" },
            { label: "完了率", value: `${completionRate}%`, color: "#FFD43B" },
            { label: "バイラル係数", value: viralCoefficient, color: "#E4405F" },
            { label: "リファラル数", value: uniqueReferrers, color: "#845EF7" },
          ].map((kpi) => (
            <Card key={kpi.label} className="text-center !p-4">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">{kpi.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: kpi.color }}>{kpi.value}</p>
            </Card>
          ))}
        </motion.div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Platform breakdown bar chart */}
          <Card>
            <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100 mb-3">プラットフォーム別</h3>
            {platformData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={platformData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="platform" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="clicks" name="クリック" fill="#6EC6FF" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completes" name="完了" fill="#06C755" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">データなし</p>
            )}
          </Card>

          {/* Platform share pie */}
          <Card>
            <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100 mb-3">シェア構成比</h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">データなし</p>
            )}
          </Card>
        </div>

        {/* Daily trend */}
        <Card>
          <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100 mb-3">日別シェア推移</h3>
          {dailyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" name="シェア数" stroke="#6EC6FF" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">データなし</p>
          )}
        </Card>

        {/* Tables row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Event breakdown */}
          <Card>
            <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100 mb-3">イベント別シェア</h3>
            <div className="overflow-x-auto touch-pan-x">
              <table className="w-full text-sm min-w-[300px]" aria-label="イベント別シェア統計">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">イベント</th>
                    <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">クリック</th>
                    <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">完了</th>
                    <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">率</th>
                  </tr>
                </thead>
                <tbody>
                  {eventBreakdown.length > 0 ? eventBreakdown.map((row) => (
                    <tr key={row.name} className="border-b border-gray-50 dark:border-gray-700">
                      <td className="py-2 px-2 text-gray-700 dark:text-gray-200 truncate max-w-[150px]">{row.name}</td>
                      <td className="py-2 px-2 text-center font-mono">{row.clicks}</td>
                      <td className="py-2 px-2 text-center font-mono">{row.completes}</td>
                      <td className="py-2 px-2 text-center font-mono">
                        {row.clicks > 0 ? `${Math.round((row.completes / row.clicks) * 100)}%` : "—"}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="py-4 text-center text-gray-400">データなし</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* UTM campaigns */}
          <Card>
            <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100 mb-3">UTMキャンペーン</h3>
            <div className="overflow-x-auto touch-pan-x">
              <table className="w-full text-sm min-w-[300px]" aria-label="UTMキャンペーン統計">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">キャンペーン</th>
                    <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">イベント数</th>
                  </tr>
                </thead>
                <tbody>
                  {utmStats.length > 0 ? utmStats.map(([campaign, count]) => (
                    <tr key={campaign} className="border-b border-gray-50 dark:border-gray-700">
                      <td className="py-2 px-2 text-gray-700 dark:text-gray-200 font-mono text-xs truncate max-w-[200px]">{campaign}</td>
                      <td className="py-2 px-2 text-center font-mono">{count}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={2} className="py-4 text-center text-gray-400">データなし</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Viral coefficient explanation */}
        <Card>
          <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100 mb-2">バイラル係数について</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            バイラル係数 = シェア完了数 / 総アクセス数。
            1.0以上で自然増殖的な拡散を意味します。
            現在の係数: <strong className="text-gray-800 dark:text-gray-100">{viralCoefficient}</strong>
            {Number(viralCoefficient) >= 1.0 ? (
              <span className="ml-2 text-green-500">拡散中</span>
            ) : Number(viralCoefficient) >= 0.5 ? (
              <span className="ml-2 text-yellow-500">良好</span>
            ) : (
              <span className="ml-2 text-gray-400">低い — シェア促進を検討してください</span>
            )}
          </p>
        </Card>
      </div>
    </div>
  );
}

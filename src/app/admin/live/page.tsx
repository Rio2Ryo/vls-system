"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import { AnalyticsRecord, EventData, Participant, VideoPlayRecord } from "@/lib/types";
import {
  getStoredEvents,
  getStoredAnalytics,
  getStoredVideoPlays,
  getStoredParticipants,
  getEventsForTenant,
  getAnalyticsForTenant,
  getVideoPlaysForTenant,
  getParticipantsForTenant,
} from "@/lib/store";

const POLL_INTERVAL = 5000;

interface LiveStats {
  registered: number;
  checkedIn: number;
  checkinRate: number;
  access: number;
  surveyDone: number;
  cmViewing: number;
  cmCompleted: number;
  cmCompletionRate: number;
  photosViewed: number;
  downloaded: number;
  dlRate: number;
  recentCheckins: { name: string; time: number }[];
}

interface Alert {
  id: string;
  type: "warning" | "danger" | "info";
  message: string;
  timestamp: number;
}

function calcStats(
  participants: Participant[],
  analytics: AnalyticsRecord[],
  videoPlays: VideoPlayRecord[],
  eventId: string,
): LiveStats {
  const evtParticipants = eventId === "all" ? participants : participants.filter((p) => p.eventId === eventId);
  const evtAnalytics = eventId === "all" ? analytics : analytics.filter((a) => a.eventId === eventId);
  const evtPlays = eventId === "all" ? videoPlays : videoPlays.filter((v) => v.eventId === eventId);

  const registered = evtParticipants.length;
  const checkedIn = evtParticipants.filter((p) => p.checkedIn).length;
  const access = evtAnalytics.filter((r) => r.stepsCompleted.access).length;
  const surveyDone = evtAnalytics.filter((r) => r.stepsCompleted.survey).length;
  const cmCompleted = evtPlays.filter((p) => p.completed).length;
  const cmViewing = evtPlays.length - cmCompleted;
  const photosViewed = evtAnalytics.filter((r) => r.stepsCompleted.photosViewed).length;
  const downloaded = evtAnalytics.filter((r) => r.stepsCompleted.downloaded).length;

  const recentCheckins = evtParticipants
    .filter((p) => p.checkedIn && p.checkedInAt)
    .sort((a, b) => (b.checkedInAt || 0) - (a.checkedInAt || 0))
    .slice(0, 5)
    .map((p) => ({ name: p.name, time: p.checkedInAt || 0 }));

  return {
    registered,
    checkedIn,
    checkinRate: registered > 0 ? Math.round((checkedIn / registered) * 100) : 0,
    access,
    surveyDone,
    cmViewing: Math.max(0, cmViewing),
    cmCompleted,
    cmCompletionRate: evtPlays.length > 0 ? Math.round((cmCompleted / evtPlays.length) * 100) : 0,
    photosViewed,
    downloaded,
    dlRate: access > 0 ? Math.round((downloaded / access) * 100) : 0,
    recentCheckins,
  };
}

function detectAlerts(stats: LiveStats, prev: LiveStats | null): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();

  // Check-in rate low
  if (stats.registered >= 5 && stats.checkinRate < 30) {
    alerts.push({ id: `checkin-low-${now}`, type: "warning", message: `チェックイン率が低下 (${stats.checkinRate}%)`, timestamp: now });
  }

  // CM completion rate dropping
  if (stats.cmCompleted + stats.cmViewing >= 3 && stats.cmCompletionRate < 40) {
    alerts.push({ id: `cm-low-${now}`, type: "warning", message: `CM完了率が低い (${stats.cmCompletionRate}%)`, timestamp: now });
  }

  // New check-ins detected
  if (prev && stats.checkedIn > prev.checkedIn) {
    const diff = stats.checkedIn - prev.checkedIn;
    alerts.push({ id: `new-checkin-${now}`, type: "info", message: `${diff}名が新たにチェックイン`, timestamp: now });
  }

  // Download milestone
  if (prev && stats.downloaded > prev.downloaded && stats.downloaded % 10 === 0) {
    alerts.push({ id: `dl-milestone-${now}`, type: "info", message: `DL完了が${stats.downloaded}件に到達!`, timestamp: now });
  }

  return alerts;
}

export default function LiveDashboardPage() {
  const { data: session, status } = useSession();
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [polling, setPolling] = useState(true);
  const prevStatsRef = useRef<LiveStats | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const tenantId = session?.user?.tenantId ?? (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ?? null;

  const refreshData = useCallback(() => {
    const evts = tenantId ? getEventsForTenant(tenantId) : getStoredEvents();
    setEvents(evts);

    const allAnalytics = tenantId ? getAnalyticsForTenant(tenantId) : getStoredAnalytics();
    const allPlays = tenantId ? getVideoPlaysForTenant(tenantId) : getStoredVideoPlays();
    const allParticipants = tenantId ? getParticipantsForTenant(tenantId) : getStoredParticipants();

    const newStats = calcStats(allParticipants, allAnalytics, allPlays, selectedEventId);
    const newAlerts = detectAlerts(newStats, prevStatsRef.current);

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts, ...prev].slice(0, 20));
    }

    prevStatsRef.current = newStats;
    setStats(newStats);
    setLastUpdate(new Date());
  }, [tenantId, selectedEventId]);

  // Initial load
  useEffect(() => {
    if (status !== "authenticated") return;
    refreshData();
  }, [status, refreshData]);

  // Polling
  useEffect(() => {
    if (status !== "authenticated" || !polling) return;
    const timer = setInterval(refreshData, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [status, polling, refreshData]);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">読み込み中...</p>
        </div>
      </main>
    );
  }

  if (status !== "authenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-sm text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-4">管理者ログインが必要です</p>
          <a href="/admin" className="text-sm text-blue-500 hover:underline">管理画面へ</a>
        </Card>
      </main>
    );
  }

  const funnelSteps = stats ? [
    { label: "アクセス", value: stats.access, color: "from-blue-500 to-blue-600" },
    { label: "アンケート", value: stats.surveyDone, color: "from-green-500 to-green-600" },
    { label: "CM完了", value: stats.cmCompleted, color: "from-yellow-500 to-yellow-600" },
    { label: "写真閲覧", value: stats.photosViewed, color: "from-pink-500 to-pink-600" },
    { label: "DL完了", value: stats.downloaded, color: "from-purple-500 to-purple-600" },
  ] : [];
  const maxFunnel = Math.max(stats?.access || 0, 1);

  return (
    <div ref={containerRef} className={`min-h-screen ${isFullscreen ? "bg-gray-950" : "bg-gray-50 dark:bg-gray-900"}`}>
      {!isFullscreen && (
        <AdminHeader
          title="VLS Live Dashboard"
          onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
        />
      )}

      <div className={`mx-auto p-4 sm:p-6 ${isFullscreen ? "max-w-full" : "max-w-6xl"}`}>
        {/* Control bar */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            aria-label="イベント選択"
            className="text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
          >
            <option value="all">全イベント</option>
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>{evt.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-2 ml-auto">
            {/* Polling indicator */}
            <button
              onClick={() => setPolling((p) => !p)}
              aria-label={polling ? "自動更新を停止" : "自動更新を開始"}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                polling
                  ? "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${polling ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
              {polling ? "LIVE" : "停止中"}
            </button>

            {/* Manual refresh */}
            <button
              onClick={refreshData}
              aria-label="手動更新"
              className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
            >
              更新
            </button>

            {/* Fullscreen toggle */}
            <button
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "フルスクリーン解除" : "フルスクリーン"}
              className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
            >
              {isFullscreen ? "縮小" : "全画面"}
            </button>

            {lastUpdate && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                更新: {lastUpdate.toLocaleTimeString("ja-JP")}
              </span>
            )}
          </div>
        </div>

        {/* Alerts */}
        <AnimatePresence>
          {alerts.slice(0, 3).map((alert) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`mb-3 px-4 py-2.5 rounded-xl text-sm flex items-center justify-between ${
                alert.type === "danger"
                  ? "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                  : alert.type === "warning"
                    ? "bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
                    : "bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400"
              }`}
              role="alert"
            >
              <span>{alert.type === "danger" ? "🚨" : alert.type === "warning" ? "⚠️" : "ℹ️"} {alert.message}</span>
              <button onClick={() => dismissAlert(alert.id)} className="ml-2 text-xs opacity-60 hover:opacity-100 focus:outline-none" aria-label="閉じる">&times;</button>
            </motion.div>
          ))}
        </AnimatePresence>

        {stats && (
          <>
            {/* KPI Cards */}
            <div className={`grid gap-4 mb-6 ${isFullscreen ? "grid-cols-3 md:grid-cols-6" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"}`}>
              {[
                { label: "登録者", value: stats.registered, icon: "👥", bg: "from-slate-500 to-slate-600" },
                { label: "チェックイン", value: stats.checkedIn, sub: `${stats.checkinRate}%`, icon: "✅", bg: "from-emerald-500 to-emerald-600" },
                { label: "アクセス", value: stats.access, icon: "🌐", bg: "from-blue-500 to-blue-600" },
                { label: "CM視聴中", value: stats.cmViewing, icon: "📺", bg: "from-amber-500 to-amber-600" },
                { label: "CM完了", value: stats.cmCompleted, sub: `${stats.cmCompletionRate}%`, icon: "🎬", bg: "from-orange-500 to-orange-600" },
                { label: "DL完了", value: stats.downloaded, sub: `${stats.dlRate}%`, icon: "📥", bg: "from-purple-500 to-purple-600" },
              ].map((kpi) => (
                <motion.div
                  key={kpi.label}
                  className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${kpi.bg} text-white p-4 shadow-lg`}
                  initial={false}
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium opacity-80">{kpi.label}</span>
                    <span className="text-lg" aria-hidden="true">{kpi.icon}</span>
                  </div>
                  <p className={`font-bold ${isFullscreen ? "text-4xl" : "text-3xl"}`}>{kpi.value}</p>
                  {kpi.sub && (
                    <span className="text-xs font-medium opacity-75">{kpi.sub}</span>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Main content grid */}
            <div className={`grid gap-6 ${isFullscreen ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 lg:grid-cols-2"}`}>
              {/* Funnel progress */}
              <Card>
                <h3 className={`font-bold text-gray-700 dark:text-gray-200 mb-4 ${isFullscreen ? "text-lg" : ""}`}>リアルタイム ファネル</h3>
                <div className="space-y-3">
                  {funnelSteps.map((step) => (
                    <div key={step.label} className="flex items-center gap-3">
                      <span className={`text-xs text-gray-500 dark:text-gray-400 w-24 text-right flex-shrink-0 ${isFullscreen ? "text-sm w-28" : ""}`}>{step.label}</span>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-7 relative overflow-hidden" role="meter" aria-label={step.label} aria-valuenow={step.value} aria-valuemin={0} aria-valuemax={maxFunnel}>
                        <motion.div
                          className={`h-full rounded-full bg-gradient-to-r ${step.color}`}
                          initial={false}
                          animate={{ width: `${(step.value / maxFunnel) * 100}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                        <span className={`absolute inset-0 flex items-center justify-center font-bold text-gray-700 dark:text-gray-200 ${isFullscreen ? "text-sm" : "text-xs"}`}>
                          {step.value}
                          <span className="ml-1 font-normal opacity-60">
                            ({stats.access > 0 ? Math.round((step.value / stats.access) * 100) : 0}%)
                          </span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Check-in progress */}
              <Card>
                <h3 className={`font-bold text-gray-700 dark:text-gray-200 mb-4 ${isFullscreen ? "text-lg" : ""}`}>チェックイン進捗</h3>
                {stats.registered === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">参加者が登録されていません</p>
                ) : (
                  <>
                    {/* Ring chart */}
                    <div className="flex items-center justify-center mb-4">
                      <div className="relative w-32 h-32">
                        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="10" className="text-gray-100 dark:text-gray-700" />
                          <motion.circle
                            cx="60" cy="60" r="50"
                            fill="none"
                            strokeWidth="10"
                            strokeLinecap="round"
                            className="text-emerald-500"
                            stroke="currentColor"
                            initial={false}
                            animate={{ strokeDasharray: `${stats.checkinRate * 3.14} 314` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`font-bold text-gray-800 dark:text-gray-100 ${isFullscreen ? "text-2xl" : "text-xl"}`}>{stats.checkinRate}%</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{stats.checkedIn}/{stats.registered}</span>
                        </div>
                      </div>
                    </div>

                    {/* Recent check-ins */}
                    {stats.recentCheckins.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">最近のチェックイン</p>
                        <div className="space-y-1.5">
                          {stats.recentCheckins.map((ci, i) => (
                            <div key={`${ci.name}-${ci.time}`} className="flex items-center gap-2 text-xs">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">{i + 1}</span>
                              <span className="text-gray-700 dark:text-gray-200 flex-1">{ci.name}</span>
                              <span className="text-gray-400 dark:text-gray-500">{new Date(ci.time).toLocaleTimeString("ja-JP")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>

              {/* Per-event breakdown */}
              {selectedEventId === "all" && events.length > 1 && (
                <Card className="lg:col-span-2">
                  <h3 className={`font-bold text-gray-700 dark:text-gray-200 mb-4 ${isFullscreen ? "text-lg" : ""}`}>イベント別ステータス</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">イベント</th>
                          <th className="text-center py-2 text-gray-500 dark:text-gray-400 font-medium">登録</th>
                          <th className="text-center py-2 text-gray-500 dark:text-gray-400 font-medium">チェックイン</th>
                          <th className="text-center py-2 text-gray-500 dark:text-gray-400 font-medium">CM完了</th>
                          <th className="text-center py-2 text-gray-500 dark:text-gray-400 font-medium">DL完了</th>
                          <th className="text-center py-2 text-gray-500 dark:text-gray-400 font-medium">DL率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((evt) => {
                          const participants = tenantId ? getParticipantsForTenant(tenantId).filter((p) => p.eventId === evt.id) : getStoredParticipants().filter((p) => p.eventId === evt.id);
                          const analytics = tenantId ? getAnalyticsForTenant(tenantId).filter((a) => a.eventId === evt.id) : getStoredAnalytics().filter((a) => a.eventId === evt.id);
                          const plays = tenantId ? getVideoPlaysForTenant(tenantId).filter((v) => v.eventId === evt.id) : getStoredVideoPlays().filter((v) => v.eventId === evt.id);
                          const reg = participants.length;
                          const ci = participants.filter((p) => p.checkedIn).length;
                          const acc = analytics.filter((r) => r.stepsCompleted.access).length;
                          const cmDone = plays.filter((p) => p.completed).length;
                          const dl = analytics.filter((r) => r.stepsCompleted.downloaded).length;
                          const dlR = acc > 0 ? Math.round((dl / acc) * 100) : 0;
                          return (
                            <tr key={evt.id} className="border-b border-gray-50 dark:border-gray-800">
                              <td className="py-2 text-gray-700 dark:text-gray-200">{evt.name}</td>
                              <td className="py-2 text-center font-mono text-gray-700 dark:text-gray-300">{reg}</td>
                              <td className="py-2 text-center">
                                <span className="font-mono text-gray-700 dark:text-gray-300">{ci}</span>
                                {reg > 0 && <span className="text-xs text-gray-400 ml-1">({Math.round((ci / reg) * 100)}%)</span>}
                              </td>
                              <td className="py-2 text-center font-mono text-gray-700 dark:text-gray-300">{cmDone}</td>
                              <td className="py-2 text-center font-mono text-gray-700 dark:text-gray-300">{dl}</td>
                              <td className="py-2 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                  dlR >= 70 ? "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                                    : dlR >= 40 ? "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
                                    : "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                                }`}>
                                  {acc > 0 ? `${dlR}%` : "—"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import AdminHeader from "@/components/admin/AdminHeader";
import Card from "@/components/ui/Card";
import {
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import {
  getStoredAnalytics,
  getStoredEvents,
  getStoredSurvey,
  getSurveyForEvent,
  getAnalyticsForTenant,
  getEventsForTenant,
} from "@/lib/store";
import { AnalyticsRecord, EventData, SurveyQuestion, InterestTag } from "@/lib/types";
import { IS_DEMO_MODE } from "@/lib/demo";
import { useEventStream } from "@/hooks/useEventStream";

const POLL_INTERVAL = 5000;

const TAG_COLORS = [
  "#6EC6FF", "#FF6B8A", "#50D9A0", "#FFB86C",
  "#BD93F9", "#8BE9FD", "#FF79C6", "#F1FA8C",
];

const CHART_COLORS = [
  "#6EC6FF", "#FF6B8A", "#50D9A0", "#FFB86C", "#BD93F9",
  "#8BE9FD", "#FF79C6", "#F1FA8C", "#FF5555", "#44B8FF",
];

const inputCls =
  "text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] focus:border-[#6EC6FF] dark:bg-gray-700 dark:text-gray-100";

export default function SurveyLivePage() {
  const { data: session, status } = useSession();
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [polling, setPolling] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [newFlash, setNewFlash] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef<number>(0);

  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [survey, setSurvey] = useState<SurveyQuestion[]>([]);

  const tenantId =
    session?.user?.tenantId ??
    (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ??
    null;

  // ---- Data refresh ----
  const refreshData = useCallback(() => {
    const evts = tenantId ? getEventsForTenant(tenantId) : getStoredEvents();
    setEvents(evts);

    const allAnalytics = tenantId ? getAnalyticsForTenant(tenantId) : getStoredAnalytics();
    setAnalytics(allAnalytics);

    if (selectedEventId !== "all") {
      setSurvey(getSurveyForEvent(selectedEventId));
    } else {
      setSurvey(getStoredSurvey());
    }
    setLastUpdate(new Date());
  }, [tenantId, selectedEventId]);

  // Initial load
  useEffect(() => {
    if (status !== "authenticated") return;
    refreshData();
  }, [status, refreshData]);

  // SSE-based data stream (falls back to polling if SSE unavailable)
  const { connected: sseConnected, mode: sseMode, lastEvent: sseLastEvent } = useEventStream({
    keys: ["vls_admin_events", "vls_analytics", "vls_admin_survey"],
    onData: refreshData,
    enabled: status === "authenticated" && polling,
    fallbackInterval: POLL_INTERVAL,
  });

  // Update lastUpdate from SSE events
  useEffect(() => {
    if (sseLastEvent) setLastUpdate(sseLastEvent);
  }, [sseLastEvent]);

  // Flash on new responses
  useEffect(() => {
    const answered = analytics.filter((r) => r.stepsCompleted.survey && r.surveyAnswers);
    if (prevLenRef.current > 0 && answered.length > prevLenRef.current) {
      setNewFlash(true);
      const t = setTimeout(() => setNewFlash(false), 1200);
      return () => clearTimeout(t);
    }
    prevLenRef.current = answered.length;
  }, [analytics]);

  // Fullscreen
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

  // ---- Loading / Unauthenticated ----
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

  // ---- Derived data (memoized) ----

  // Filter by event
  const filtered = selectedEventId === "all"
    ? analytics
    : analytics.filter((r) => r.eventId === selectedEventId);

  const filteredAnswered = filtered.filter(
    (r) => r.stepsCompleted.survey && r.surveyAnswers,
  );

  // KPI: totals
  const totalResponses = filteredAnswered.length;

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const recentCount = filtered.filter(
    (r) => r.stepsCompleted.survey && r.timestamp >= fiveMinAgo,
  ).length;

  // Avg response speed (interval between consecutive survey submissions)
  const surveyTimestamps = filteredAnswered.map((r) => r.timestamp).sort((a, b) => a - b);
  let avgSpeed = 0;
  if (surveyTimestamps.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < surveyTimestamps.length; i++) {
      gaps.push((surveyTimestamps[i] - surveyTimestamps[i - 1]) / 1000);
    }
    avgSpeed = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  }

  const accessCount = filtered.filter((r) => r.stepsCompleted.access).length;
  const completionRate = accessCount > 0 ? Math.round((totalResponses / accessCount) * 100) : 0;

  // ---- Tag Cloud ----
  const tagLabels = new Map<string, string>();
  for (const q of survey) {
    for (const opt of q.options) tagLabels.set(opt.tag, opt.label);
  }

  const tagCounts = new Map<string, number>();
  for (const r of filteredAnswered) {
    for (const tags of Object.values(r.surveyAnswers!)) {
      for (const t of tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }
  const tagEntries = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
  const maxTagCount = tagEntries.length > 0 ? tagEntries[0][1] : 1;

  // ---- Response Speed Graph (5-min buckets, last 2 hours) ----
  const now = Date.now();
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;
  const bucketSize = 5 * 60 * 1000;

  const bucketCounts = new Map<number, number>();
  for (let t = twoHoursAgo; t <= now; t += bucketSize) {
    bucketCounts.set(Math.floor(t / bucketSize) * bucketSize, 0);
  }
  for (const r of filteredAnswered) {
    if (r.timestamp >= twoHoursAgo) {
      const bs = Math.floor(r.timestamp / bucketSize) * bucketSize;
      bucketCounts.set(bs, (bucketCounts.get(bs) || 0) + 1);
    }
  }
  const speedBuckets = Array.from(bucketCounts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ts, count]) => ({
      time: new Date(ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      count,
    }));

  // ---- Per-question distribution ----
  const questionStats = survey.map((q) => {
    const counts: Record<string, number> = {};
    for (const opt of q.options) counts[opt.tag] = 0;
    for (const r of filteredAnswered) {
      const tags = r.surveyAnswers?.[q.id] || [];
      for (const t of tags) counts[t] = (counts[t] || 0) + 1;
    }
    return {
      question: q,
      chartData: q.options.map((opt) => ({
        name: opt.label,
        count: counts[opt.tag] || 0,
        pct: filteredAnswered.length > 0 ? Math.round(((counts[opt.tag] || 0) / filteredAnswered.length) * 100) : 0,
      })),
    };
  });

  // ---- Live Feed (last 10 responses) ----
  const eventMap = new Map<string, string>();
  for (const evt of events) eventMap.set(evt.id, evt.name);

  const recentResponses = [...filteredAnswered]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);

  return (
    <div
      ref={containerRef}
      className={`min-h-screen ${isFullscreen ? "bg-gray-950" : "bg-gray-50 dark:bg-gray-900"}`}
    >
      {!isFullscreen && (
        <AdminHeader
          title={IS_DEMO_MODE ? "アンケートLive (Demo)" : "アンケートLive"}
          badge={`${totalResponses}件回答`}
          onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
        />
      )}

      <div className={`mx-auto p-4 sm:p-6 ${isFullscreen ? "max-w-full" : "max-w-6xl"}`}>
        {/* Fullscreen title */}
        {isFullscreen && (
          <h1 className="text-xl font-bold text-white mb-4">アンケートLive — リアルタイム集計</h1>
        )}

        {/* ── Control Bar ── */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            aria-label="イベント選択"
            className={inputCls}
          >
            <option value="all">全イベント</option>
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>{evt.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-2 ml-auto">
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
              {polling ? (sseMode === "sse" && sseConnected ? "SSE" : "LIVE") : "停止中"}
            </button>

            <button
              onClick={refreshData}
              aria-label="手動更新"
              className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
            >
              更新
            </button>

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

        {/* ── New response flash ── */}
        <AnimatePresence>
          {newFlash && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-3 px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 text-sm text-center"
              role="alert"
            >
              新しい回答が届きました
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── KPI Cards ── */}
        <div
          className={`grid gap-4 mb-6 ${isFullscreen ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-4"}`}
          role="status"
          aria-live="polite"
        >
          {[
            { label: "総回答数", value: totalResponses, icon: "📝", bg: "from-blue-500 to-blue-600" },
            { label: "直近5分", value: recentCount, icon: "⚡", bg: "from-emerald-500 to-emerald-600" },
            { label: "平均回答間隔", value: `${avgSpeed}秒`, icon: "⏱", bg: "from-amber-500 to-amber-600" },
            { label: "回答率", value: `${completionRate}%`, icon: "📊", bg: "from-purple-500 to-purple-600" },
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
            </motion.div>
          ))}
        </div>

        {/* ── Main Grid ── */}
        <div className={`grid gap-6 ${isFullscreen ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 lg:grid-cols-2"}`}>
          {/* Tag Cloud */}
          <Card>
            <h3 className={`font-bold text-gray-700 dark:text-gray-200 mb-4 ${isFullscreen ? "text-lg" : ""}`}>
              タグクラウド
            </h3>
            {tagEntries.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">回答データがありません</p>
            ) : (
              <div className="flex flex-wrap gap-2 sm:gap-3 min-h-[120px] items-center justify-center" role="status" aria-live="polite">
                <AnimatePresence>
                  {tagEntries.map(([tag, count], index) => {
                    const fontSize = Math.max(12, Math.min(36, 12 + (count / maxTagCount) * 24));
                    const opacity = Math.max(0.4, count / maxTagCount);
                    const color = TAG_COLORS[index % TAG_COLORS.length];
                    return (
                      <motion.span
                        key={tag}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.3 }}
                        className="inline-block px-2 py-1 rounded-lg font-medium cursor-default"
                        style={{ fontSize: `${fontSize}px`, opacity, color }}
                        title={`${tagLabels.get(tag as InterestTag) || tag}: ${count}件`}
                      >
                        {tagLabels.get(tag as InterestTag) || tag}
                      </motion.span>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </Card>

          {/* Response Speed Graph */}
          <Card>
            <h3 className={`font-bold text-gray-700 dark:text-gray-200 mb-4 ${isFullscreen ? "text-lg" : ""}`}>
              回答速度グラフ（5分間隔）
            </h3>
            {speedBuckets.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">データなし</p>
            ) : (
              <div className="w-full h-64" role="img" aria-label="回答速度の折れ線グラフ">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={speedBuckets}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#9CA3AF" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "12px", color: "#F3F4F6", fontSize: "12px" }}
                      labelFormatter={(label) => `時間: ${label}`}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any) => [`${value}件`, "回答数"]}
                    />
                    <Line type="monotone" dataKey="count" name="回答数" stroke="#6EC6FF" strokeWidth={2} dot={{ r: 3, fill: "#6EC6FF" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Per-question distribution */}
          {questionStats.map((qs, qi) => (
            <Card key={qs.question.id}>
              <h3 className={`font-bold text-gray-700 dark:text-gray-200 mb-1 ${isFullscreen ? "text-base" : "text-sm"}`}>
                Q{qi + 1}. {qs.question.question}
              </h3>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3">{filteredAnswered.length}件回答</p>
              {filteredAnswered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">データなし</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(qs.chartData.length * 36, 100)}>
                  <BarChart data={qs.chartData} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any, _name: any, props: any) => [`${value}件 (${props?.payload?.pct ?? 0}%)`, "回答数"]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {qs.chartData.map((_entry, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          ))}

          {/* Live Feed */}
          <Card className={questionStats.length % 2 === 0 ? "lg:col-span-2" : ""}>
            <h3 className={`font-bold text-gray-700 dark:text-gray-200 mb-4 ${isFullscreen ? "text-lg" : ""}`}>
              最新回答フィード
            </h3>
            {recentResponses.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">回答がまだありません</p>
            ) : (
              <div className="space-y-2" role="log" aria-live="polite" aria-label="最新回答一覧">
                <AnimatePresence>
                  {recentResponses.map((r) => {
                    const allTags: InterestTag[] = [];
                    if (r.surveyAnswers) {
                      for (const tags of Object.values(r.surveyAnswers)) allTags.push(...tags);
                    }
                    return (
                      <motion.div
                        key={r.id}
                        initial={{ y: -12, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -12, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600"
                      >
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 min-w-[80px]">
                          {r.respondentName || "匿名"}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {eventMap.get(r.eventId) || r.eventId}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto mr-2">
                          {new Date(r.timestamp).toLocaleTimeString("ja-JP")}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {allTags.map((tag, idx) => (
                            <span
                              key={`${r.id}-${tag}-${idx}`}
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{
                                backgroundColor: `${TAG_COLORS[idx % TAG_COLORS.length]}22`,
                                color: TAG_COLORS[idx % TAG_COLORS.length],
                              }}
                            >
                              {tagLabels.get(tag) || tag}
                            </span>
                          ))}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

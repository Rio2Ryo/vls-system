"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredBehaviorEvents,
  getBehaviorEventsForEvent,
  getStoredEvents,
} from "@/lib/store";
import { BehaviorEvent, EventData } from "@/lib/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// --- Constants ---

const STEPS = [
  { path: "/", label: "ログイン" },
  { path: "/survey", label: "アンケート" },
  { path: "/processing", label: "CM視聴" },
  { path: "/photos", label: "写真閲覧" },
  { path: "/complete", label: "完了" },
];

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] text-sm dark:bg-gray-700 dark:text-gray-100";

// --- Helpers ---

function formatDwell(ms: number): string {
  if (!ms || ms <= 0) return "0m 0s";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

// --- CSV Export ---

function downloadBehaviorCsv(events: BehaviorEvent[]): void {
  const header =
    "id,eventId,sessionId,type,page,timestamp,dwellMs,scrollDepth,targetElement";
  const rows = events.map((e) => {
    const id = (e.id ?? "").replace(/"/g, '""');
    const eventId = (e.eventId ?? "").replace(/"/g, '""');
    const sessionId = (e.sessionId ?? "").replace(/"/g, '""');
    const type = (e.type ?? "").replace(/"/g, '""');
    const page = (e.page ?? "").replace(/"/g, '""');
    const ts = String(e.timestamp ?? "");
    const dwell = String(e.dwellMs ?? "");
    const scroll = String(e.scrollDepth ?? "");
    const target = (e.targetElement ?? "").replace(/"/g, '""');
    return `"${id}","${eventId}","${sessionId}","${type}","${page}","${ts}","${dwell}","${scroll}","${target}"`;
  });
  const csv = "\uFEFF" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `behavior-heatmap-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Page ---

export default function HeatmapPage() {
  const { status } = useSession();

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [events, setEvents] = useState<EventData[]>([]);

  // Redirect if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/admin";
  }, [status]);

  // Load events on mount
  useEffect(() => {
    if (status === "authenticated") {
      setEvents(getStoredEvents());
    }
  }, [status]);

  // All behavior events (filtered by event if selected)
  const allBehaviorEvents = useMemo<BehaviorEvent[]>(() => {
    if (status !== "authenticated") return [];
    if (eventFilter === "all") return getStoredBehaviorEvents();
    return getBehaviorEventsForEvent(eventFilter);
  }, [eventFilter, status]);

  // --- KPI calculations ---

  const totalEvents = allBehaviorEvents.length;

  const uniqueSessions = useMemo(() => {
    const sessions = new Set(allBehaviorEvents.map((e) => e.sessionId));
    return sessions.size;
  }, [allBehaviorEvents]);

  const avgDwellTime = useMemo(() => {
    const leaveEvents = allBehaviorEvents.filter(
      (e) => e.type === "page_leave" && e.dwellMs != null && e.dwellMs > 0
    );
    if (leaveEvents.length === 0) return 0;
    const totalMs = leaveEvents.reduce((sum, e) => sum + (e.dwellMs ?? 0), 0);
    return totalMs / leaveEvents.length;
  }, [allBehaviorEvents]);

  const topExitPage = useMemo(() => {
    // page_leave events without a corresponding next page_view from the same session
    const leaveEvents = allBehaviorEvents.filter(
      (e) => e.type === "page_leave"
    );
    const viewEvents = allBehaviorEvents.filter(
      (e) => e.type === "page_view"
    );

    // For each session, find the last page_leave and check if there is a subsequent page_view
    const exitCounts = new Map<string, number>();

    // Group leaves by session
    const leavesBySession = new Map<string, BehaviorEvent[]>();
    for (const ev of leaveEvents) {
      const list = leavesBySession.get(ev.sessionId) ?? [];
      list.push(ev);
      leavesBySession.set(ev.sessionId, list);
    }

    // Group views by session
    const viewsBySession = new Map<string, BehaviorEvent[]>();
    for (const ev of viewEvents) {
      const list = viewsBySession.get(ev.sessionId) ?? [];
      list.push(ev);
      viewsBySession.set(ev.sessionId, list);
    }

    for (const [sessionId, leaves] of Array.from(leavesBySession)) {
      const views = viewsBySession.get(sessionId) ?? [];
      for (const leave of leaves) {
        // Check if there is a page_view after this page_leave
        const hasNext = views.some((v) => v.timestamp > leave.timestamp);
        if (!hasNext) {
          exitCounts.set(
            leave.page,
            (exitCounts.get(leave.page) ?? 0) + 1
          );
        }
      }
    }

    if (exitCounts.size === 0) return "---";

    let maxPage = "---";
    let maxCount = 0;
    for (const [page, count] of Array.from(exitCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxPage = page;
      }
    }

    // Map path to label
    const step = STEPS.find((s) => s.path === maxPage);
    return step ? step.label : maxPage;
  }, [allBehaviorEvents]);

  // --- Step funnel calculations ---

  const funnelData = useMemo(() => {
    const viewsByStep = STEPS.map((step) => {
      const pageViews = allBehaviorEvents.filter(
        (e) => e.type === "page_view" && e.page === step.path
      );
      const pageLeaves = allBehaviorEvents.filter(
        (e) => e.type === "page_leave" && e.page === step.path
      );

      const uniqueViewSessions = new Set(pageViews.map((e) => e.sessionId))
        .size;

      const dwellTimes = pageLeaves
        .filter((e) => e.dwellMs != null && e.dwellMs > 0)
        .map((e) => e.dwellMs!);
      const avgDwell =
        dwellTimes.length > 0
          ? dwellTimes.reduce((a, b) => a + b, 0) / dwellTimes.length
          : 0;

      const scrollDepths = allBehaviorEvents
        .filter(
          (e) =>
            e.type === "scroll" &&
            e.page === step.path &&
            e.scrollDepth != null
        )
        .map((e) => e.scrollDepth!);
      const avgScroll =
        scrollDepths.length > 0
          ? scrollDepths.reduce((a, b) => a + b, 0) / scrollDepths.length
          : 0;

      return {
        ...step,
        viewCount: uniqueViewSessions,
        avgDwell,
        avgScroll: Math.round(avgScroll),
      };
    });

    // Calculate max view count for heat intensity
    const maxViews = Math.max(1, ...viewsByStep.map((s) => s.viewCount));

    return viewsByStep.map((step, idx) => {
      const nextStep = viewsByStep[idx + 1];
      const dropoutPct =
        nextStep && step.viewCount > 0
          ? Math.round(
              ((step.viewCount - nextStep.viewCount) / step.viewCount) * 100
            )
          : null;
      const intensity = Math.max(
        20,
        Math.round((step.viewCount / maxViews) * 90)
      );

      return {
        ...step,
        dropoutPct,
        intensity,
      };
    });
  }, [allBehaviorEvents]);

  // --- Time-series (hourly page_view counts) ---

  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, "0")}:00`,
      count: 0,
    }));
    const pageViews = allBehaviorEvents.filter(
      (e) => e.type === "page_view"
    );
    for (const ev of pageViews) {
      const h = new Date(ev.timestamp).getHours();
      hours[h].count++;
    }
    return hours;
  }, [allBehaviorEvents]);

  // --- Tap heatmap table (top 20 tapped elements) ---

  const tapData = useMemo(() => {
    const taps = allBehaviorEvents.filter((e) => e.type === "tap");
    const tapCounts = new Map<string, { count: number; page: string }>();
    for (const tap of taps) {
      const target = tap.targetElement ?? "(unknown)";
      const key = `${target}::${tap.page}`;
      const existing = tapCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        tapCounts.set(key, { count: 1, page: tap.page });
      }
    }

    return Array.from(tapCounts)
      .map(([key, val]) => ({
        target: key.split("::")[0],
        page: val.page,
        count: val.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [allBehaviorEvents]);

  // --- Dropout analysis ---

  const dropoutData = useMemo(() => {
    // For each step, count sessions that viewed this step but NOT the next step
    const sessionPages = new Map<string, Set<string>>();
    const pageViews = allBehaviorEvents.filter(
      (e) => e.type === "page_view"
    );
    for (const ev of pageViews) {
      const pages = sessionPages.get(ev.sessionId) ?? new Set<string>();
      pages.add(ev.page);
      sessionPages.set(ev.sessionId, pages);
    }

    return STEPS.map((step, idx) => {
      if (idx === STEPS.length - 1) {
        // Last step has no dropout to next
        return { ...step, sessionsHere: 0, droppedOut: 0, pct: 0 };
      }
      const nextStep = STEPS[idx + 1];
      let sessionsHere = 0;
      let droppedOut = 0;

      for (const [, pages] of Array.from(sessionPages)) {
        if (pages.has(step.path)) {
          sessionsHere++;
          if (!pages.has(nextStep.path)) {
            droppedOut++;
          }
        }
      }

      const pct =
        sessionsHere > 0 ? Math.round((droppedOut / sessionsHere) * 100) : 0;
      return { ...step, sessionsHere, droppedOut, pct };
    });
  }, [allBehaviorEvents]);

  const maxDropoutPct = useMemo(() => {
    return Math.max(0, ...dropoutData.map((d) => d.pct));
  }, [dropoutData]);

  // --- Event handlers ---

  const handleEventFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setEventFilter(e.target.value);
    },
    []
  );

  const handleExportCsv = useCallback(() => {
    downloadBehaviorCsv(allBehaviorEvents);
  }, [allBehaviorEvents]);

  // --- Loading State ---

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            ヒートマップを読み込み中...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title="行動ヒートマップ"
        badge={`${totalEvents}件`}
        onLogout={() => {
          sessionStorage.removeItem("adminTenantId");
          signOut({ redirect: false });
        }}
        actions={
          <button
            onClick={handleExportCsv}
            disabled={allBehaviorEvents.length === 0}
            aria-label="CSVエクスポート"
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] transition-colors"
          >
            CSV出力
          </button>
        }
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* === Event Filter === */}
        <Card>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <label
              htmlFor="event-filter"
              className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap"
            >
              イベント絞り込み
            </label>
            <div className="w-full sm:w-64">
              <select
                id="event-filter"
                value={eventFilter}
                onChange={handleEventFilterChange}
                aria-label="イベントフィルター"
                className={inputCls}
              >
                <option value="all">全イベント</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* === KPI Cards === */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "総イベント数",
              value: String(totalEvents),
              icon: "E",
              color:
                "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
            },
            {
              label: "ユニークセッション数",
              value: String(uniqueSessions),
              icon: "S",
              color:
                "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400",
            },
            {
              label: "平均滞在時間",
              value: formatDwell(avgDwellTime),
              icon: "T",
              color:
                "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
            },
            {
              label: "最大離脱ページ",
              value: topExitPage,
              icon: "X",
              color:
                "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
            },
          ].map((s) => (
            <Card key={s.label} className="text-center">
              <div
                className={`inline-flex w-10 h-10 rounded-full items-center justify-center text-lg font-bold mb-2 ${s.color}`}
              >
                {s.icon}
              </div>
              <p className="text-xl font-bold text-gray-800 dark:text-gray-100">
                {s.value}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {s.label}
              </p>
            </Card>
          ))}
        </div>

        {/* === Step Funnel Heatmap === */}
        <Card>
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4">
            ステップファネル ヒートマップ
          </h2>
          {allBehaviorEvents.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              行動データがありません
            </p>
          ) : (
            <div className="overflow-x-auto" style={{ touchAction: "pan-x" }}>
              <div className="flex items-stretch gap-0 min-w-[600px]">
                {funnelData.map((step, idx) => (
                  <div key={step.path} className="flex items-stretch flex-1">
                    {/* Step block */}
                    <div
                      className="flex-1 rounded-xl p-4 text-center transition-colors"
                      style={{
                        backgroundColor: `rgba(110, 198, 255, ${step.intensity / 100})`,
                      }}
                    >
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-100 mb-1">
                        {step.label}
                      </p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {step.viewCount}
                      </p>
                      <p className="text-[10px] text-gray-600 dark:text-gray-300 mt-1">
                        PV数
                      </p>
                      <div className="mt-2 space-y-0.5">
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          滞在: {formatDwell(step.avgDwell)}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          スクロール: {step.avgScroll}%
                        </p>
                      </div>
                    </div>
                    {/* Dropout arrow between steps */}
                    {idx < funnelData.length - 1 && (
                      <div className="flex flex-col items-center justify-center px-2 min-w-[60px]">
                        <div className="text-gray-400 dark:text-gray-500 text-lg">
                          →
                        </div>
                        {step.dropoutPct !== null && (
                          <p
                            className={`text-[10px] font-medium mt-0.5 ${
                              step.dropoutPct > 50
                                ? "text-red-500 dark:text-red-400"
                                : step.dropoutPct > 25
                                  ? "text-yellow-600 dark:text-yellow-400"
                                  : "text-green-600 dark:text-green-400"
                            }`}
                          >
                            -{step.dropoutPct}%
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* === Time-Series Chart (Hourly) === */}
        <Card>
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4">
            時間帯別アクセス数
          </h2>
          {allBehaviorEvents.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              行動データがありません
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={hourlyData}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e5e7eb"
                    className="dark:opacity-20"
                  />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    interval={2}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                    }}
                    labelFormatter={(label) => `${label}`}
                    formatter={(value) => [
                      `${value ?? 0}件`,
                      "ページビュー",
                    ]}
                  />
                  <Bar
                    dataKey="count"
                    fill="#6EC6FF"
                    radius={[4, 4, 0, 0]}
                    name="ページビュー"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* === Tap Heatmap Table === */}
        <Card className="!p-0">
          <div className="px-6 pt-6 pb-3">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">
              タップヒートマップ（上位20件）
            </h2>
          </div>
          {tapData.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8 px-6">
              タップデータがありません
            </p>
          ) : (
            <div className="overflow-x-auto" style={{ touchAction: "pan-x" }}>
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">
                      #
                    </th>
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">
                      ターゲット要素
                    </th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">
                      タップ数
                    </th>
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">
                      ページ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tapData.map((row, idx) => {
                    const stepLabel =
                      STEPS.find((s) => s.path === row.page)?.label ??
                      row.page;
                    return (
                      <tr
                        key={`${row.target}-${row.page}-${idx}`}
                        className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="py-2.5 px-4 text-gray-400 dark:text-gray-500">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-4 text-gray-700 dark:text-gray-200 font-mono max-w-[250px] truncate">
                          {row.target}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-gray-800 dark:text-gray-100">
                          {row.count}
                        </td>
                        <td className="py-2.5 px-4 text-gray-500 dark:text-gray-400">
                          {stepLabel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* === Dropout Analysis === */}
        <Card>
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4">
            離脱分析
          </h2>
          {allBehaviorEvents.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              行動データがありません
            </p>
          ) : (
            <div className="space-y-3">
              {dropoutData.map((step, idx) => {
                if (idx === STEPS.length - 1) return null;
                const isBiggest =
                  step.pct > 0 && step.pct === maxDropoutPct;
                return (
                  <div key={step.path}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                          {step.label} → {STEPS[idx + 1].label}
                        </span>
                        {isBiggest && (
                          <span className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                            最大離脱
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          {step.droppedOut}/{step.sessionsHere}セッション
                        </span>
                        <span
                          className={`text-xs font-bold ${
                            step.pct > 50
                              ? "text-red-500 dark:text-red-400"
                              : step.pct > 25
                                ? "text-yellow-600 dark:text-yellow-400"
                                : "text-green-600 dark:text-green-400"
                          }`}
                        >
                          {step.pct}%
                        </span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all ${
                          step.pct > 50
                            ? "bg-red-500"
                            : step.pct > 25
                              ? "bg-yellow-500"
                              : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(step.pct, 100)}%` }}
                        role="progressbar"
                        aria-valuenow={step.pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${step.label}から${STEPS[idx + 1].label}への離脱率: ${step.pct}%`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  AnalyticsRecord,
  EventData,
  Participant,
  VideoPlayRecord,
} from "@/lib/types";
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

const POLL_INTERVAL = 10000;

interface EventKPI {
  eventId: string;
  eventName: string;
  date: string;
  registered: number;
  checkedIn: number;
  checkinRate: number;
  access: number;
  surveyDone: number;
  cmCompleted: number;
  cmCompletionRate: number;
  downloaded: number;
  dlRate: number;
  anomalies: Anomaly[];
}

interface Anomaly {
  type: "danger" | "warning" | "info";
  message: string;
}

interface GlobalKPI {
  totalEvents: number;
  totalRegistered: number;
  totalCheckedIn: number;
  avgCheckinRate: number;
  totalAccess: number;
  totalDownloaded: number;
  avgDlRate: number;
  avgCmCompletionRate: number;
}

function calcEventKPI(
  event: EventData,
  participants: Participant[],
  analytics: AnalyticsRecord[],
  videoPlays: VideoPlayRecord[],
): EventKPI {
  const evtP = participants.filter((p) => p.eventId === event.id);
  const evtA = analytics.filter((a) => a.eventId === event.id);
  const evtV = videoPlays.filter((v) => v.eventId === event.id);

  const registered = evtP.length;
  const checkedIn = evtP.filter((p) => p.checkedIn).length;
  const access = evtA.filter((r) => r.stepsCompleted.access).length;
  const surveyDone = evtA.filter((r) => r.stepsCompleted.survey).length;
  const cmCompleted = evtV.filter((v) => v.completed).length;
  const downloaded = evtA.filter((r) => r.stepsCompleted.downloaded).length;

  const checkinRate = registered > 0 ? Math.round((checkedIn / registered) * 100) : 0;
  const cmCompletionRate = evtV.length > 0 ? Math.round((cmCompleted / evtV.length) * 100) : 0;
  const dlRate = access > 0 ? Math.round((downloaded / access) * 100) : 0;

  const anomalies: Anomaly[] = [];
  if (registered >= 5 && checkinRate < 30) {
    anomalies.push({ type: "danger", message: `チェックイン率が低い (${checkinRate}%)` });
  } else if (registered >= 5 && checkinRate < 50) {
    anomalies.push({ type: "warning", message: `チェックイン率が低め (${checkinRate}%)` });
  }
  if (evtV.length >= 3 && cmCompletionRate < 40) {
    anomalies.push({ type: "danger", message: `CM完了率が低い (${cmCompletionRate}%)` });
  }
  if (access >= 5 && dlRate < 20) {
    anomalies.push({ type: "warning", message: `DL率が低い (${dlRate}%)` });
  }
  if (registered === 0 && access > 0) {
    anomalies.push({ type: "info", message: "参加者未登録（飛び込み参加のみ）" });
  }

  return {
    eventId: event.id,
    eventName: event.name,
    date: event.date,
    registered,
    checkedIn,
    checkinRate,
    access,
    surveyDone,
    cmCompleted,
    cmCompletionRate,
    downloaded,
    dlRate,
    anomalies,
  };
}

function calcGlobalKPI(eventKPIs: EventKPI[]): GlobalKPI {
  const n = eventKPIs.length;
  const totalRegistered = eventKPIs.reduce((s, e) => s + e.registered, 0);
  const totalCheckedIn = eventKPIs.reduce((s, e) => s + e.checkedIn, 0);
  const totalAccess = eventKPIs.reduce((s, e) => s + e.access, 0);
  const totalDownloaded = eventKPIs.reduce((s, e) => s + e.downloaded, 0);

  const withRegistered = eventKPIs.filter((e) => e.registered > 0);
  const avgCheckinRate = withRegistered.length > 0
    ? Math.round(withRegistered.reduce((s, e) => s + e.checkinRate, 0) / withRegistered.length)
    : 0;
  const avgDlRate = totalAccess > 0 ? Math.round((totalDownloaded / totalAccess) * 100) : 0;
  const avgCmCompletionRate = n > 0
    ? Math.round(eventKPIs.reduce((s, e) => s + e.cmCompletionRate, 0) / n)
    : 0;

  return { totalEvents: n, totalRegistered, totalCheckedIn, avgCheckinRate, totalAccess, totalDownloaded, avgDlRate, avgCmCompletionRate };
}

function KPICard({ label, value, suffix, accent }: { label: string; value: number; suffix?: string; accent?: boolean }) {
  return (
    <div className={`text-center p-3 rounded-xl ${accent ? "bg-blue-50 dark:bg-blue-900/20" : "bg-gray-50 dark:bg-gray-800"}`}>
      <p className="text-2xl font-black text-gray-800 dark:text-gray-100">
        {value}{suffix}
      </p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function AnomalyBadge({ anomaly }: { anomaly: Anomaly }) {
  const colors = {
    danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors[anomaly.type]}`}>
      {anomaly.message}
    </span>
  );
}

function EventRow({ kpi }: { kpi: EventKPI }) {
  const hasAnomaly = kpi.anomalies.length > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-xl border ${
        hasAnomaly
          ? "border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10"
          : "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-bold text-sm text-gray-800 dark:text-gray-100">{kpi.eventName}</p>
          <p className="text-[11px] text-gray-400">{kpi.date}</p>
        </div>
        {hasAnomaly && (
          <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold" aria-label="異常検知あり">
            !
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center mb-2">
        <div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{kpi.checkinRate}%</p>
          <p className="text-[10px] text-gray-400">チェックイン</p>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{kpi.cmCompletionRate}%</p>
          <p className="text-[10px] text-gray-400">CM完了</p>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{kpi.dlRate}%</p>
          <p className="text-[10px] text-gray-400">DL率</p>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{kpi.access}</p>
          <p className="text-[10px] text-gray-400">アクセス</p>
        </div>
      </div>

      {kpi.anomalies.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {kpi.anomalies.map((a, i) => (
            <AnomalyBadge key={i} anomaly={a} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default function CommandCenterPage() {
  const { status } = useSession();
  const [eventKPIs, setEventKPIs] = useState<EventKPI[]>([]);
  const [globalKPI, setGlobalKPI] = useState<GlobalKPI | null>(null);
  const [filterDate, setFilterDate] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const tenantId = typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null;

  const refresh = useCallback(() => {
    const events = tenantId ? getEventsForTenant(tenantId) : getStoredEvents();
    const analytics = tenantId ? getAnalyticsForTenant(tenantId) : getStoredAnalytics();
    const videoPlays = tenantId ? getVideoPlaysForTenant(tenantId) : getStoredVideoPlays();
    const participants = tenantId ? getParticipantsForTenant(tenantId) : getStoredParticipants();

    let filteredEvents = events;
    if (filterDate) {
      filteredEvents = events.filter((e) => e.date === filterDate);
    }

    const kpis = filteredEvents.map((e) => calcEventKPI(e, participants, analytics, videoPlays));
    // Sort: anomalies first, then by date desc
    kpis.sort((a, b) => {
      if (a.anomalies.length > 0 && b.anomalies.length === 0) return -1;
      if (a.anomalies.length === 0 && b.anomalies.length > 0) return 1;
      return b.date.localeCompare(a.date);
    });

    setEventKPIs(kpis);
    setGlobalKPI(calcGlobalKPI(kpis));
    setLastUpdated(new Date());
  }, [tenantId, filterDate]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [refresh]);

  if (status === "loading") return null;
  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <a href="/admin" className="text-blue-500 underline">管理画面ログイン</a>
      </div>
    );
  }

  const totalAnomalies = eventKPIs.reduce((s, e) => s + e.anomalies.length, 0);
  const uniqueDates = Array.from(new Set(eventKPIs.map((e) => e.date))).sort().reverse();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title="統合管理センター"
        badge={`${eventKPIs.length}イベント`}
        onLogout={() => signOut({ callbackUrl: "/admin" })}
        actions={
          totalAnomalies > 0 ? (
            <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">
              {totalAnomalies}件の異常
            </span>
          ) : null
        }
      />

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Filter bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label htmlFor="date-filter" className="text-xs text-gray-500 dark:text-gray-400">日付フィルター</label>
            <select
              id="date-filter"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] focus:border-[#6EC6FF]"
              aria-label="日付フィルター"
            >
              <option value="">全日程</option>
              {uniqueDates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          {lastUpdated && (
            <p className="text-[10px] text-gray-400">
              最終更新: {lastUpdated.toLocaleTimeString("ja-JP")}
            </p>
          )}
        </div>

        {/* Global KPI summary */}
        {globalKPI && (
          <div role="region" aria-label="横断KPIサマリー">
          <Card>
            <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-3">横断KPIサマリー</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPICard label="総イベント数" value={globalKPI.totalEvents} />
              <KPICard label="総登録者" value={globalKPI.totalRegistered} />
              <KPICard label="チェックイン率 (平均)" value={globalKPI.avgCheckinRate} suffix="%" accent />
              <KPICard label="総アクセス" value={globalKPI.totalAccess} />
              <KPICard label="総チェックイン" value={globalKPI.totalCheckedIn} />
              <KPICard label="総DL完了" value={globalKPI.totalDownloaded} />
              <KPICard label="DL率 (平均)" value={globalKPI.avgDlRate} suffix="%" accent />
              <KPICard label="CM完了率 (平均)" value={globalKPI.avgCmCompletionRate} suffix="%" accent />
            </div>
          </Card>
          </div>
        )}

        {/* Anomaly alert banner */}
        <AnimatePresence>
          {totalAnomalies > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div role="alert" aria-live="polite">
              <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
                <p className="text-sm font-bold text-red-700 dark:text-red-400 mb-2">
                  異常検知: {totalAnomalies}件
                </p>
                <div className="space-y-1">
                  {eventKPIs.filter((e) => e.anomalies.length > 0).map((e) => (
                    <div key={e.eventId} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{e.eventName}:</span>
                      {e.anomalies.map((a, i) => (
                        <AnomalyBadge key={i} anomaly={a} />
                      ))}
                    </div>
                  ))}
                </div>
              </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Per-event KPI list */}
        <div>
          <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-3">
            イベント別KPI {filterDate && `(${filterDate})`}
          </p>
          {eventKPIs.length === 0 ? (
            <Card className="text-center">
              <p className="text-sm text-gray-400">該当するイベントがありません</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {eventKPIs.map((kpi) => (
                <EventRow key={kpi.eventId} kpi={kpi} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

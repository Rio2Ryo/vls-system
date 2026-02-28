"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import { AnalyticsRecord, EventData } from "@/lib/types";
import {
  getStoredEvents,
  getStoredAnalytics,
  getEventsForTenant,
  getAnalyticsForTenant,
} from "@/lib/store";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  tenantId?: string | null;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getWeekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export default function QRAnalyticsTab({ tenantId }: Props) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);

  useEffect(() => {
    setEvents(tenantId ? getEventsForTenant(tenantId) : getStoredEvents());
    setAnalytics(tenantId ? getAnalyticsForTenant(tenantId) : getStoredAnalytics());
  }, [tenantId]);

  const now = Date.now();
  const todayStart = startOfDay(now);
  const weekStart = getWeekStart(now);

  // --- Summary ---
  const totalAccess = analytics.length;
  const todayAccess = analytics.filter((r) => r.timestamp >= todayStart).length;
  const weekAccess = analytics.filter((r) => r.timestamp >= weekStart).length;

  const avgDaily = useMemo(() => {
    if (analytics.length === 0) return 0;
    const timestamps = analytics.map((r) => r.timestamp);
    const minTs = Math.min(...timestamps);
    const days = Math.max(1, Math.ceil((now - minTs) / (1000 * 60 * 60 * 24)));
    return Math.round((analytics.length / days) * 10) / 10;
  }, [analytics, now]);

  // --- Daily chart (last 30 days) ---
  const dailyData = useMemo(() => {
    const result: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dayTs = startOfDay(now - i * 24 * 60 * 60 * 1000);
      const nextDay = dayTs + 24 * 60 * 60 * 1000;
      const count = analytics.filter(
        (r) => r.timestamp >= dayTs && r.timestamp < nextDay
      ).length;
      result.push({ date: formatDate(dayTs), count });
    }
    return result;
  }, [analytics, now]);

  // --- Weekly chart (last 12 weeks) ---
  const weeklyData = useMemo(() => {
    const result: { week: string; count: number }[] = [];
    const currentWeekStart = getWeekStart(now);
    for (let i = 11; i >= 0; i--) {
      const ws = currentWeekStart - i * 7 * 24 * 60 * 60 * 1000;
      const we = ws + 7 * 24 * 60 * 60 * 1000;
      const count = analytics.filter(
        (r) => r.timestamp >= ws && r.timestamp < we
      ).length;
      result.push({ week: `${formatDate(ws)}~`, count });
    }
    return result;
  }, [analytics, now]);

  // --- Event breakdown ---
  const eventBreakdown = useMemo(() => {
    const evtMap = new Map(events.map((e) => [e.id, e.name]));
    const counts: Record<string, { name: string; count: number }> = {};
    for (const r of analytics) {
      const name = evtMap.get(r.eventId) || r.eventId;
      if (!counts[r.eventId]) counts[r.eventId] = { name, count: 0 };
      counts[r.eventId].count++;
    }
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [analytics, events]);

  // --- Hourly heatmap ---
  const hourlyData = useMemo(() => {
    const hours = new Array(24).fill(0);
    for (const r of analytics) {
      const h = new Date(r.timestamp).getHours();
      hours[h]++;
    }
    const max = Math.max(...hours, 1);
    return hours.map((count, hour) => ({ hour, count, intensity: count / max }));
  }, [analytics]);

  function heatColor(intensity: number): string {
    if (intensity === 0) return "bg-gray-100 dark:bg-gray-700";
    if (intensity < 0.25) return "bg-blue-100 dark:bg-blue-900/40";
    if (intensity < 0.5) return "bg-blue-200 dark:bg-blue-800/50";
    if (intensity < 0.75) return "bg-blue-300 dark:bg-blue-700/60";
    return "bg-blue-500 dark:bg-blue-600";
  }

  function heatText(intensity: number): string {
    if (intensity >= 0.75) return "text-white";
    return "text-gray-700 dark:text-gray-300";
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
        QR分析
      </h2>

      {/* A. Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "総アクセス数", value: totalAccess },
          { label: "今日のアクセス", value: todayAccess },
          { label: "今週のアクセス", value: weekAccess },
          { label: "平均日次アクセス", value: avgDaily },
        ].map((item) => (
          <Card key={item.label} className="text-center py-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              {item.label}
            </p>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {item.value}
            </p>
          </Card>
        ))}
      </div>

      {/* B. Daily bar chart */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
          日別アクセス数（直近30日）
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" name="アクセス数" fill="#6EC6FF" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* C. Weekly bar chart */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
          週別アクセス数（直近12週）
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" name="アクセス数" fill="#6EC6FF" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* D. Event breakdown */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
          イベント別アクセス内訳
        </h3>
        {eventBreakdown.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">データなし</p>
        ) : (
          <div className="space-y-2">
            {eventBreakdown.map((evt) => {
              const pct = totalAccess > 0 ? (evt.count / totalAccess) * 100 : 0;
              return (
                <div key={evt.name} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300 w-36 truncate flex-shrink-0">
                    {evt.name}
                  </span>
                  <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        backgroundColor: "#6EC6FF",
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300 w-20 text-right flex-shrink-0">
                    {evt.count}件 ({Math.round(pct)}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* E. Hourly heatmap */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
          時間帯別アクセス（ヒートマップ）
        </h3>
        <div className="grid grid-cols-8 md:grid-cols-12 gap-1">
          {hourlyData.map(({ hour, count, intensity }) => (
            <div
              key={hour}
              className={`rounded p-2 text-center ${heatColor(intensity)} ${heatText(intensity)}`}
            >
              <p className="text-[10px] font-medium">{hour}時</p>
              <p className="text-sm font-bold">{count}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-400 dark:text-gray-500">
          <span>少</span>
          <div className="w-4 h-3 rounded bg-gray-100 dark:bg-gray-700" />
          <div className="w-4 h-3 rounded bg-blue-100 dark:bg-blue-900/40" />
          <div className="w-4 h-3 rounded bg-blue-200 dark:bg-blue-800/50" />
          <div className="w-4 h-3 rounded bg-blue-300 dark:bg-blue-700/60" />
          <div className="w-4 h-3 rounded bg-blue-500 dark:bg-blue-600" />
          <span>多</span>
        </div>
      </Card>
    </div>
  );
}

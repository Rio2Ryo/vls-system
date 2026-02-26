"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import Card from "@/components/ui/Card";
import { AnalyticsRecord, EventData, VideoPlayRecord } from "@/lib/types";
import {
  getStoredEvents,
  getStoredAnalytics,
  getStoredVideoPlays,
  getEventsForTenant,
  getAnalyticsForTenant,
  getVideoPlaysForTenant,
} from "@/lib/store";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface Props {
  tenantId?: string | null;
}

const STEP_LABELS = ["アクセス", "アンケート", "CM視聴", "写真閲覧", "DL完了"];
const STEP_KEYS: (keyof AnalyticsRecord["stepsCompleted"])[] = [
  "access",
  "survey",
  "cmViewed",
  "photosViewed",
  "downloaded",
];
const STEP_COLORS = ["#60A5FA", "#34D399", "#FBBF24", "#F472B6", "#A78BFA"];

export default function ChartJsAnalytics({ tenantId }: Props) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [videoPlays, setVideoPlays] = useState<VideoPlayRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("all");

  useEffect(() => {
    if (tenantId) {
      setEvents(getEventsForTenant(tenantId));
      setAnalytics(getAnalyticsForTenant(tenantId));
      setVideoPlays(getVideoPlaysForTenant(tenantId));
    } else {
      setEvents(getStoredEvents());
      setAnalytics(getStoredAnalytics());
      setVideoPlays(getStoredVideoPlays());
    }
  }, [tenantId]);

  const filtered = useMemo(
    () =>
      selectedEventId === "all"
        ? analytics
        : analytics.filter((r) => r.eventId === selectedEventId),
    [analytics, selectedEventId]
  );

  const total = filtered.length;
  const stepCounts = STEP_KEYS.map(
    (k) => filtered.filter((r) => r.stepsCompleted[k]).length
  );
  const completionRate =
    total > 0 ? Math.round((stepCounts[4] / total) * 100) : 0;

  // --- Doughnut: overall completion rate ---
  const doughnutData = {
    labels: ["DL完了", "未完了"],
    datasets: [
      {
        data: [stepCounts[4], Math.max(total - stepCounts[4], 0)],
        backgroundColor: ["#A78BFA", "#E5E7EB"],
        borderWidth: 0,
      },
    ],
  };

  // --- Bar: per-step counts ---
  const barData = {
    labels: STEP_LABELS,
    datasets: [
      {
        label: "完了数",
        data: stepCounts,
        backgroundColor: STEP_COLORS,
        borderRadius: 6,
      },
    ],
  };

  // --- Per-event comparison bar ---
  const eventComparisonData = useMemo(() => {
    if (events.length <= 1) return null;
    const names = events.map((e) =>
      e.name.length > 10 ? e.name.slice(0, 10) + "…" : e.name
    );
    const accessCounts = events.map(
      (e) =>
        analytics.filter(
          (a) => a.eventId === e.id && a.stepsCompleted.access
        ).length
    );
    const dlCounts = events.map(
      (e) =>
        analytics.filter(
          (a) => a.eventId === e.id && a.stepsCompleted.downloaded
        ).length
    );
    return {
      labels: names,
      datasets: [
        {
          label: "アクセス",
          data: accessCounts,
          backgroundColor: "#60A5FA",
          borderRadius: 4,
        },
        {
          label: "DL完了",
          data: dlCounts,
          backgroundColor: "#A78BFA",
          borderRadius: 4,
        },
      ],
    };
  }, [events, analytics]);

  // --- Daily trend line (filtered by selected event) ---
  const trendData = useMemo(() => {
    if (filtered.length === 0) return null;
    const dayMap: Record<string, { access: number; dl: number }> = {};
    for (const a of filtered) {
      const day = new Date(a.timestamp).toLocaleDateString("ja", {
        month: "short",
        day: "numeric",
      });
      if (!dayMap[day]) dayMap[day] = { access: 0, dl: 0 };
      if (a.stepsCompleted.access) dayMap[day].access++;
      if (a.stepsCompleted.downloaded) dayMap[day].dl++;
    }
    const days = Object.keys(dayMap).slice(-14); // last 14 days
    return {
      labels: days,
      datasets: [
        {
          label: "アクセス",
          data: days.map((d) => dayMap[d]?.access || 0),
          borderColor: "#60A5FA",
          backgroundColor: "rgba(96,165,250,0.1)",
          fill: true,
          tension: 0.3,
        },
        {
          label: "DL完了",
          data: days.map((d) => dayMap[d]?.dl || 0),
          borderColor: "#A78BFA",
          backgroundColor: "rgba(167,139,250,0.1)",
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }, [filtered]);

  // --- CM completion rate (filtered by selected event) ---
  const filteredVideoPlays = useMemo(
    () =>
      selectedEventId === "all"
        ? videoPlays
        : videoPlays.filter((v) => v.eventId === selectedEventId),
    [videoPlays, selectedEventId]
  );

  const cmStats = useMemo(() => {
    const completed = filteredVideoPlays.filter((v) => v.completed).length;
    const cmTotal = filteredVideoPlays.length;
    return {
      total: cmTotal,
      completed,
      rate: cmTotal > 0 ? Math.round((completed / cmTotal) * 100) : 0,
    };
  }, [filteredVideoPlays]);

  return (
    <div className="space-y-6" data-testid="chartjs-analytics">
      {/* Header + filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">
          完了率アナリティクス（Chart.js）
        </h2>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#6EC6FF]"
        >
          <option value="all">全イベント ({analytics.length}件)</option>
          {events.map((evt) => {
            const c = analytics.filter((r) => r.eventId === evt.id).length;
            return (
              <option key={evt.id} value={evt.id}>
                {evt.name} ({c}件)
              </option>
            );
          })}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "総アクセス",
            value: String(total),
            color: "text-blue-600 bg-blue-50",
          },
          {
            label: "DL完了率",
            value: total > 0 ? `${completionRate}%` : "—",
            color: "text-purple-600 bg-purple-50",
          },
          {
            label: "CM完了率",
            value: cmStats.total > 0 ? `${cmStats.rate}%` : "—",
            color: "text-yellow-600 bg-yellow-50",
          },
          {
            label: "イベント数",
            value: String(events.length),
            color: "text-pink-600 bg-pink-50",
          },
        ].map((s) => (
          <Card key={s.label} className="text-center">
            <p className={`text-2xl font-bold ${s.color.split(" ")[0]}`}>
              {s.value}
            </p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Row: Doughnut + Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-bold text-gray-700 mb-3 text-sm">
            総合完了率
          </h3>
          {total === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              データなし
            </p>
          ) : (
            <div className="flex items-center justify-center" style={{ height: 220 }}>
              <Doughnut
                data={doughnutData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: "70%",
                  plugins: {
                    legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => `${ctx.label}: ${ctx.parsed} (${total > 0 ? Math.round((ctx.parsed / total) * 100) : 0}%)`,
                      },
                    },
                  },
                }}
              />
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-bold text-gray-700 mb-3 text-sm">
            STEP別完了数
          </h3>
          {total === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              データなし
            </p>
          ) : (
            <div style={{ height: 220 }}>
              <Bar
                data={barData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx) =>
                          `${ctx.label}: ${ctx.parsed.y ?? 0} (${total > 0 ? Math.round(((ctx.parsed.y ?? 0) / total) * 100) : 0}%)`,
                      },
                    },
                  },
                  scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
                    x: { ticks: { font: { size: 10 } } },
                  },
                }}
              />
            </div>
          )}
        </Card>
      </div>

      {/* Event comparison */}
      {eventComparisonData && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3 text-sm">
            イベント別アクセス vs DL完了
          </h3>
          <div style={{ height: 250 }}>
            <Bar
              data={eventComparisonData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
                },
                scales: {
                  y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
                  x: { ticks: { font: { size: 10 } } },
                },
              }}
            />
          </div>
        </Card>
      )}

      {/* Trend line */}
      {trendData && trendData.labels.length > 1 && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3 text-sm">
            日別トレンド（直近14日）
          </h3>
          <div style={{ height: 220 }}>
            <Line
              data={trendData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
                },
                scales: {
                  y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
                  x: { ticks: { font: { size: 10 } } },
                },
              }}
            />
          </div>
        </Card>
      )}

      {/* Step-by-step dropout table */}
      {total > 0 && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3 text-sm">
            STEP間離脱分析
          </h3>
          <div className="space-y-2">
            {STEP_KEYS.map((k, i) => {
              if (i === 0) return null;
              const prev = stepCounts[i - 1];
              const curr = stepCounts[i];
              const dropped = prev - curr;
              const dropPct =
                prev > 0 ? Math.round((dropped / prev) * 100) : 0;
              const bg =
                dropPct >= 50
                  ? "bg-red-50 text-red-600"
                  : dropPct >= 25
                    ? "bg-yellow-50 text-yellow-600"
                    : "bg-green-50 text-green-600";
              return (
                <div
                  key={k}
                  className="flex items-center gap-3 p-2 rounded-lg bg-gray-50"
                >
                  <span className="text-xs text-gray-500 w-36 flex-shrink-0">
                    {STEP_LABELS[i - 1]} → {STEP_LABELS[i]}
                  </span>
                  <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-red-300 rounded-full"
                      style={{ width: `${dropPct}%` }}
                    />
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${bg}`}
                  >
                    -{dropped}人 ({dropPct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { AnalyticsRecord, EventData } from "@/lib/types";
import { getStoredEvents, getStoredAnalytics, getEventsForTenant, getAnalyticsForTenant } from "@/lib/store";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Props {
  tenantId?: string | null;
}

export default function FunnelAnalysisTab({ tenantId }: Props) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("all");

  useEffect(() => {
    setEvents(tenantId ? getEventsForTenant(tenantId) : getStoredEvents());
    setAnalytics(tenantId ? getAnalyticsForTenant(tenantId) : getStoredAnalytics());
  }, [tenantId]);

  const filtered = selectedEventId === "all"
    ? analytics
    : analytics.filter((r) => r.eventId === selectedEventId);

  const steps = [
    { key: "access" as const, label: "STEP 0: アクセス", color: "#60A5FA" },
    { key: "survey" as const, label: "STEP 1: アンケート完了", color: "#34D399" },
    { key: "cmViewed" as const, label: "STEP 2: CM視聴完了", color: "#FBBF24" },
    { key: "photosViewed" as const, label: "STEP 3: 写真閲覧", color: "#F472B6" },
    { key: "downloaded" as const, label: "STEP 4-5: DL完了", color: "#A78BFA" },
  ];

  const total = filtered.length;
  const counts = steps.map((s) => filtered.filter((r) => r.stepsCompleted[s.key]).length);
  const rates = counts.map((c) => total > 0 ? Math.round((c / total) * 100) : 0);
  const dropoffs = counts.map((c, i) => {
    const prev = i === 0 ? total : counts[i - 1];
    return prev > 0 ? Math.round(((prev - c) / prev) * 100) : 0;
  });

  // Per-event comparison data
  const eventComparison = events.map((evt) => {
    const evtRecords = analytics.filter((r) => r.eventId === evt.id);
    const evtTotal = evtRecords.length;
    return {
      name: evt.name.length > 8 ? evt.name.slice(0, 8) + "..." : evt.name,
      fullName: evt.name,
      total: evtTotal,
      access: evtRecords.filter((r) => r.stepsCompleted.access).length,
      survey: evtRecords.filter((r) => r.stepsCompleted.survey).length,
      cmViewed: evtRecords.filter((r) => r.stepsCompleted.cmViewed).length,
      photosViewed: evtRecords.filter((r) => r.stepsCompleted.photosViewed).length,
      downloaded: evtRecords.filter((r) => r.stepsCompleted.downloaded).length,
      completionRate: evtTotal > 0 ? Math.round((evtRecords.filter((r) => r.stepsCompleted.downloaded).length / evtTotal) * 100) : 0,
    };
  });

  return (
    <div className="space-y-6" data-testid="admin-funnel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">STEP完了率分析</h2>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          aria-label="イベントで絞り込み"
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#6EC6FF] focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
        >
          <option value="all">全イベント ({analytics.length}件)</option>
          {events.map((evt) => {
            const c = analytics.filter((r) => r.eventId === evt.id).length;
            return <option key={evt.id} value={evt.id}>{evt.name} ({c}件)</option>;
          })}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        {steps.map((s, i) => (
          <Card key={s.key} className="text-center">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{counts[i]}</div>
            <p className="text-[10px] text-gray-500 mt-0.5">{s.label.split(": ")[1]}</p>
            <p className="text-xs font-bold text-gray-700">{rates[i]}%</p>
          </Card>
        ))}
      </div>

      {/* Funnel visualization */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-4">ファネル (離脱率)</h3>
        {total === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">まだデータがありません</p>
        ) : (
          <div className="space-y-4">
            {steps.map((s, i) => {
              const width = total > 0 ? Math.max(8, (counts[i] / total) * 100) : 0;
              return (
                <div key={s.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">{s.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-800">{counts[i]}人 ({rates[i]}%)</span>
                      {i > 0 && dropoffs[i] > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-500 font-bold">
                          -{dropoffs[i]}% 離脱
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="w-full bg-gray-100 rounded-full h-8 relative overflow-hidden"
                    role="meter"
                    aria-label={s.label}
                    aria-valuenow={counts[i]}
                    aria-valuemin={0}
                    aria-valuemax={total}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-700 flex items-center justify-center"
                      style={{ width: `${width}%`, backgroundColor: s.color }}
                    >
                      {width > 20 && (
                        <span className="text-white text-xs font-bold">{rates[i]}%</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Overall conversion */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">総合コンバージョン率</span>
              <span className={`text-lg font-bold ${
                rates[4] >= 60 ? "text-green-600" : rates[4] >= 30 ? "text-yellow-600" : "text-red-500"
              }`}>
                {rates[4]}%
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Bar chart visualization */}
      {total > 0 && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-4">STEP別完了数（棒グラフ）</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={steps.map((s, i) => ({ name: s.label.split(": ")[1], count: counts[i], color: s.color, dropoff: dropoffs[i] }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`${value}`, "完了数"]} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {steps.map((s, i) => (
                    <Cell key={`cell-${i}`} fill={s.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Per-event comparison table */}
      {events.length > 1 && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">イベント別比較</h3>
          <div className="overflow-x-auto touch-pan-x">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-gray-500 font-medium">イベント</th>
                  <th className="text-center py-2 text-gray-500 font-medium">総数</th>
                  <th className="text-center py-2 text-gray-500 font-medium">アンケート</th>
                  <th className="text-center py-2 text-gray-500 font-medium">CM視聴</th>
                  <th className="text-center py-2 text-gray-500 font-medium">写真閲覧</th>
                  <th className="text-center py-2 text-gray-500 font-medium">DL完了</th>
                  <th className="text-center py-2 text-gray-500 font-medium">完了率</th>
                </tr>
              </thead>
              <tbody>
                {eventComparison.map((ec) => (
                  <tr key={ec.fullName} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700 font-medium" title={ec.fullName}>{ec.name}</td>
                    <td className="py-2 text-center font-mono">{ec.total}</td>
                    <td className="py-2 text-center font-mono">{ec.survey}</td>
                    <td className="py-2 text-center font-mono">{ec.cmViewed}</td>
                    <td className="py-2 text-center font-mono">{ec.photosViewed}</td>
                    <td className="py-2 text-center font-mono">{ec.downloaded}</td>
                    <td className="py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        ec.completionRate >= 60 ? "bg-green-50 text-green-600" :
                        ec.completionRate >= 30 ? "bg-yellow-50 text-yellow-600" :
                        "bg-red-50 text-red-500"
                      }`}>
                        {ec.total > 0 ? `${ec.completionRate}%` : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Step-by-step dropout analysis */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-3">STEP間離脱分析</h3>
        {total === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">データなし</p>
        ) : (
          <div className="space-y-3">
            {steps.map((s, i) => {
              if (i === 0) return null;
              const prevCount = counts[i - 1];
              const dropped = prevCount - counts[i];
              const dropPct = prevCount > 0 ? Math.round((dropped / prevCount) * 100) : 0;
              const severity = dropPct >= 50 ? "text-red-600 bg-red-50" : dropPct >= 25 ? "text-yellow-600 bg-yellow-50" : "text-green-600 bg-green-50";
              return (
                <div key={s.key} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <div className="flex items-center gap-1 text-xs text-gray-500 w-44 flex-shrink-0">
                    <span>{steps[i - 1].label.split(": ")[1]}</span>
                    <span className="text-gray-300">→</span>
                    <span>{s.label.split(": ")[1]}</span>
                  </div>
                  <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden" role="meter" aria-label={`${steps[i - 1].label.split(": ")[1]}→${s.label.split(": ")[1]}離脱率`} aria-valuenow={dropPct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-red-300 rounded-full" style={{ width: `${dropPct}%` }} />
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${severity}`}>
                    {dropped}人離脱 ({dropPct}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

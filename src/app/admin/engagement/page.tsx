"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredAnalytics,
  getStoredVideoPlays,
  getStoredBehaviorEvents,
  getStoredNpsResponses,
  getStoredOfferInteractions,
  getStoredEvents,
} from "@/lib/store";
import { EngagementScore, EventData } from "@/lib/types";
import {
  calculateEngagementScores,
  buildHistogram,
  aggregateByEvent,
  getEngagementTier,
} from "@/lib/engagement";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

/* ─── constants ─── */

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] text-sm dark:bg-gray-700 dark:text-gray-100";

const TIER_COLORS: Record<string, string> = {
  "高": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  "中": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  "低": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

const FACTOR_LABELS: { key: keyof EngagementScore; label: string }[] = [
  { key: "pvScore", label: "PV" },
  { key: "dwellScore", label: "滞在" },
  { key: "cmCompletionScore", label: "CM" },
  { key: "photoDlScore", label: "DL" },
  { key: "npsScore", label: "NPS" },
  { key: "couponScore", label: "クーポン" },
];

/* ─── CSV export ─── */

function downloadCsv(scores: EngagementScore[]): void {
  const header =
    "eventName,participantName,totalScore,tier,pvScore,dwellScore,cmCompletionScore,photoDlScore,npsScore,couponScore";
  const rows = scores.map((s) => {
    const eName = (s.eventName ?? "").replace(/"/g, '""');
    const pName = (s.participantName ?? "").replace(/"/g, '""');
    return `"${eName}","${pName}",${s.totalScore},"${getEngagementTier(s.totalScore)}",${s.pvScore},${s.dwellScore},${s.cmCompletionScore},${s.photoDlScore},${s.npsScore},${s.couponScore}`;
  });
  const csv = "\uFEFF" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `engagement-scores-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── page ─── */

export default function EngagementPage() {
  const { status } = useSession();
  const [events, setEvents] = useState<EventData[]>([]);
  const [scores, setScores] = useState<EngagementScore[]>([]);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"totalScore" | "participantName">("totalScore");
  const [sortAsc, setSortAsc] = useState(false);
  const [topN, setTopN] = useState(20);

  // Redirect if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/admin";
  }, [status]);

  // Load data
  useEffect(() => {
    if (status !== "authenticated") return;
    const evts = getStoredEvents();
    setEvents(evts);

    const result = calculateEngagementScores({
      analytics: getStoredAnalytics(),
      videoPlays: getStoredVideoPlays(),
      behaviorEvents: getStoredBehaviorEvents(),
      npsResponses: getStoredNpsResponses(),
      offerInteractions: getStoredOfferInteractions(),
      events: evts,
    });
    setScores(result);
  }, [status]);

  // Filtered scores
  const filtered = useMemo(() => {
    if (eventFilter === "all") return scores;
    return scores.filter((s) => s.eventId === eventFilter);
  }, [scores, eventFilter]);

  // Sorted scores
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = sortKey === "participantName" ? a.participantName : a.totalScore;
      const bv = sortKey === "participantName" ? b.participantName : b.totalScore;
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortAsc]);

  // KPI
  const avgScore = filtered.length > 0
    ? Math.round(filtered.reduce((s, e) => s + e.totalScore, 0) / filtered.length)
    : 0;
  const highCount = filtered.filter((s) => s.totalScore >= 70).length;
  const midCount = filtered.filter((s) => s.totalScore >= 40 && s.totalScore < 70).length;
  const lowCount = filtered.filter((s) => s.totalScore < 40).length;

  // Histogram data
  const histogram = useMemo(() => buildHistogram(filtered), [filtered]);

  // Event comparison data
  const eventComparison = useMemo(() => aggregateByEvent(scores), [scores]);

  const handleLogout = () => {
    sessionStorage.removeItem("adminTenantId");
    signOut({ redirect: false });
  };

  if (status !== "authenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AdminHeader
        title="エンゲージメントスコア"
        badge={`${filtered.length}名`}
        onLogout={handleLogout}
      />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <h1 className="text-2xl font-bold text-[var(--text)]" aria-label="エンゲージメントスコア">
            参加者エンゲージメントスコア
          </h1>
          <div className="flex flex-wrap gap-3 items-center">
            <select
              className={inputCls + " w-48"}
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              aria-label="イベントフィルター"
            >
              <option value="all">全イベント</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
            <button
              onClick={() => downloadCsv(sorted)}
              className="px-4 py-2 text-sm bg-[#6EC6FF] text-white rounded-xl hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
              aria-label="CSV出力"
            >
              CSV出力
            </button>
          </div>
        </div>

        {/* ─── KPI Cards ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <div className="text-center">
              <p className="text-xs text-[var(--text-light)] mb-1">参加者数</p>
              <p className="text-2xl font-bold text-[var(--text)]">{filtered.length}</p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-xs text-[var(--text-light)] mb-1">平均スコア</p>
              <p className="text-2xl font-bold text-[var(--text)]">{avgScore}</p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-xs text-[var(--text-light)] mb-1">高エンゲージ (70+)</p>
              <p className="text-2xl font-bold text-green-600">{highCount}</p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-xs text-[var(--text-light)] mb-1">低エンゲージ (&lt;40)</p>
              <p className="text-2xl font-bold text-red-500">{lowCount}</p>
            </div>
          </Card>
        </div>

        {/* ─── Histogram ─── */}
        <Card>
          <h2 className="text-lg font-bold mb-4 text-[var(--text)]">スコア分布</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="参加者数" fill="#6EC6FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ─── Event Comparison ─── */}
        {eventComparison.length > 1 && (
          <Card>
            <h2 className="text-lg font-bold mb-4 text-[var(--text)]">イベント比較</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eventComparison}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="eventName" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="avgScore" name="平均スコア" fill="#A78BFA" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="highPct" name="高エンゲージ率 (%)" fill="#98E4C1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* ─── Top Participants Table ─── */}
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-[var(--text)]">参加者一覧 (上位{topN}名)</h2>
            <div className="flex gap-2 items-center">
              <label className="text-xs text-[var(--text-light)]">表示件数:</label>
              <select
                className={inputCls + " w-24"}
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                aria-label="表示件数"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto -mx-4 px-4 touch-pan-x">
            <table className="w-full text-sm min-w-[700px]" aria-label="エンゲージメントスコア一覧">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 px-2 text-[var(--text-light)] font-medium">#</th>
                  <th
                    className="text-left py-2 px-2 text-[var(--text-light)] font-medium cursor-pointer hover:text-[#6EC6FF]"
                    onClick={() => {
                      if (sortKey === "participantName") setSortAsc(!sortAsc);
                      else { setSortKey("participantName"); setSortAsc(true); }
                    }}
                  >
                    参加者 {sortKey === "participantName" ? (sortAsc ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-left py-2 px-2 text-[var(--text-light)] font-medium">イベント</th>
                  <th
                    className="text-right py-2 px-2 text-[var(--text-light)] font-medium cursor-pointer hover:text-[#6EC6FF]"
                    onClick={() => {
                      if (sortKey === "totalScore") setSortAsc(!sortAsc);
                      else { setSortKey("totalScore"); setSortAsc(false); }
                    }}
                  >
                    スコア {sortKey === "totalScore" ? (sortAsc ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-center py-2 px-2 text-[var(--text-light)] font-medium">ランク</th>
                  {FACTOR_LABELS.map((f) => (
                    <th key={f.key} className="text-right py-2 px-2 text-[var(--text-light)] font-medium text-xs">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, topN).map((s, i) => {
                  const tier = getEngagementTier(s.totalScore);
                  return (
                    <tr key={s.id} className="border-b border-[var(--border)] hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-2 px-2 text-[var(--text-light)]">{i + 1}</td>
                      <td className="py-2 px-2 font-medium text-[var(--text)]">{s.participantName}</td>
                      <td className="py-2 px-2 text-[var(--text-light)] text-xs">{s.eventName}</td>
                      <td className="py-2 px-2 text-right font-bold text-[var(--text)]">{s.totalScore}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${TIER_COLORS[tier]}`}>
                          {tier}
                        </span>
                      </td>
                      {FACTOR_LABELS.map((f) => (
                        <td key={f.key} className="py-2 px-2 text-right text-xs text-[var(--text-light)]">
                          {s[f.key] as number}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={5 + FACTOR_LABELS.length} className="py-8 text-center text-[var(--text-light)]">
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tier summary bar */}
          {filtered.length > 0 && (
            <div className="mt-4 flex items-center gap-2 text-xs" aria-label="エンゲージメント分布">
              <div
                className="h-3 rounded-l-full bg-green-400"
                style={{ width: `${(highCount / filtered.length) * 100}%`, minWidth: highCount > 0 ? 4 : 0 }}
                title={`高: ${highCount}`}
              />
              <div
                className="h-3 bg-yellow-400"
                style={{ width: `${(midCount / filtered.length) * 100}%`, minWidth: midCount > 0 ? 4 : 0 }}
                title={`中: ${midCount}`}
              />
              <div
                className="h-3 rounded-r-full bg-red-400"
                style={{ width: `${(lowCount / filtered.length) * 100}%`, minWidth: lowCount > 0 ? 4 : 0 }}
                title={`低: ${lowCount}`}
              />
              <span className="text-[var(--text-light)] ml-2">
                高 {highCount} / 中 {midCount} / 低 {lowCount}
              </span>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line,
} from "recharts";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredNpsResponses,
  getStoredEvents, getEventsForTenant,
  getNpsForTenant,
  getParticipantsForEvent,
} from "@/lib/store";
import { NpsResponse, EventData, Participant } from "@/lib/types";
import { IS_DEMO_MODE } from "@/lib/demo";
import { csrfHeaders } from "@/lib/csrf";

// --- NPS Calculation ---

function calcNps(responses: NpsResponse[]): {
  nps: number; promoters: number; passives: number; detractors: number; total: number;
} {
  const answered = responses.filter((r) => r.respondedAt && r.score !== undefined);
  if (answered.length === 0) return { nps: 0, promoters: 0, passives: 0, detractors: 0, total: 0 };

  const promoters = answered.filter((r) => r.score! >= 9).length;
  const passives = answered.filter((r) => r.score! >= 7 && r.score! <= 8).length;
  const detractors = answered.filter((r) => r.score! <= 6).length;
  const total = answered.length;
  const nps = Math.round(((promoters - detractors) / total) * 100);

  return { nps, promoters, passives, detractors, total };
}

// --- Helpers ---

function toWeekKey(ts: number): string {
  const d = new Date(ts);
  // ISO week: set to nearest Thursday
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return `${monday.getMonth() + 1}/${monday.getDate()}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// --- Colors ---

const NPS_COLORS = {
  promoter: "#22C55E",
  passive: "#FBBF24",
  detractor: "#EF4444",
};

function npsColor(nps: number): string {
  if (nps < 0) return "#EF4444";
  if (nps < 30) return "#FBBF24";
  return "#22C55E";
}

function scoreBarColor(score: number): string {
  if (score >= 9) return NPS_COLORS.promoter;
  if (score >= 7) return NPS_COLORS.passive;
  return NPS_COLORS.detractor;
}

// --- Tooltip style ---

const tooltipStyle = {
  backgroundColor: "#1F2937",
  border: "1px solid #374151",
  borderRadius: "12px",
  color: "#F3F4F6",
  fontSize: "12px",
};

// --- Page ---

export default function NpsPage() {
  const { data: session, status } = useSession();

  const [npsResponses, setNpsResponses] = useState<NpsResponse[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [filterEvent, setFilterEvent] = useState("all");

  // Send NPS section
  const [sendEventId, setSendEventId] = useState("");
  const [sending, setSending] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const tenantId = session?.user?.tenantId ?? (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ?? null;

  const inputCls = "text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] focus:border-[#6EC6FF] dark:bg-gray-700 dark:text-gray-100";

  // --- Data Loading ---

  const reload = useCallback(() => {
    if (status !== "authenticated") return;
    if (tenantId) {
      setEvents(getEventsForTenant(tenantId));
      setNpsResponses(getNpsForTenant(tenantId));
    } else {
      setEvents(getStoredEvents());
      setNpsResponses(getStoredNpsResponses());
    }
  }, [status, tenantId]);

  useEffect(() => { reload(); }, [reload]);

  // --- Filtered responses ---

  const filtered = useMemo(() => {
    if (filterEvent === "all") return npsResponses;
    return npsResponses.filter((r) => r.eventId === filterEvent);
  }, [npsResponses, filterEvent]);

  // --- NPS Calculation ---

  const npsResult = useMemo(() => calcNps(filtered), [filtered]);

  const totalSent = filtered.length;
  const totalAnswered = filtered.filter((r) => r.respondedAt && r.score !== undefined).length;
  const responseRate = totalSent > 0 ? Math.round((totalAnswered / totalSent) * 100) : 0;

  // --- KPI Data ---

  const promoterPct = npsResult.total > 0 ? Math.round((npsResult.promoters / npsResult.total) * 100) : 0;
  const passivePct = npsResult.total > 0 ? Math.round((npsResult.passives / npsResult.total) * 100) : 0;
  const detractorPct = npsResult.total > 0 ? Math.round((npsResult.detractors / npsResult.total) * 100) : 0;

  // --- Pie Chart Data ---

  const pieData = useMemo(() => {
    if (npsResult.total === 0) return [];
    return [
      { name: "推奨者 (9-10)", value: npsResult.promoters, color: NPS_COLORS.promoter },
      { name: "中立者 (7-8)", value: npsResult.passives, color: NPS_COLORS.passive },
      { name: "批判者 (0-6)", value: npsResult.detractors, color: NPS_COLORS.detractor },
    ].filter((d) => d.value > 0);
  }, [npsResult]);

  // --- Score Distribution Bar Chart Data ---

  const scoreDistribution = useMemo(() => {
    const answered = filtered.filter((r) => r.respondedAt && r.score !== undefined);
    const counts = Array.from({ length: 11 }, (_, i) => ({
      score: String(i),
      count: answered.filter((r) => r.score === i).length,
      fill: scoreBarColor(i),
    }));
    return counts;
  }, [filtered]);

  // --- Event Comparison Data ---

  const eventComparison = useMemo(() => {
    if (events.length <= 1) return [];
    return events.map((evt) => {
      const evtResponses = npsResponses.filter((r) => r.eventId === evt.id);
      const result = calcNps(evtResponses);
      return {
        name: evt.name.length > 12 ? evt.name.slice(0, 12) + "..." : evt.name,
        fullName: evt.name,
        NPS: result.nps,
        回答数: result.total,
      };
    }).filter((e) => e.回答数 > 0);
  }, [events, npsResponses]);

  // --- NPS Trend Over Time (by week) ---

  const trendData = useMemo(() => {
    const answered = filtered.filter((r) => r.respondedAt && r.score !== undefined);
    if (answered.length === 0) return [];

    const weekMap = new Map<string, { ts: number; responses: NpsResponse[] }>();
    for (const r of answered) {
      const key = toWeekKey(r.respondedAt!);
      if (!weekMap.has(key)) weekMap.set(key, { ts: r.respondedAt!, responses: [] });
      weekMap.get(key)!.responses.push(r);
    }

    return Array.from(weekMap.entries())
      .sort((a, b) => a[1].ts - b[1].ts)
      .slice(-12)
      .map(([week, data]) => {
        const result = calcNps(data.responses);
        return { week, NPS: result.nps, 回答数: result.total };
      });
  }, [filtered]);

  // --- Recent Comments ---

  const recentComments = useMemo(() => {
    return filtered
      .filter((r) => r.respondedAt && r.comment && r.comment.trim().length > 0)
      .sort((a, b) => (b.respondedAt || 0) - (a.respondedAt || 0))
      .slice(0, 20);
  }, [filtered]);

  // --- Participants for send section ---

  const sendParticipants = useMemo((): Participant[] => {
    if (!sendEventId) return [];
    return getParticipantsForEvent(sendEventId);
  }, [sendEventId]);

  const sendableCount = useMemo(() => {
    return sendParticipants.filter((p) => p.email && p.email.trim().length > 0).length;
  }, [sendParticipants]);

  // --- Send NPS emails ---

  const handleSendNps = async () => {
    if (!sendEventId || sending) return;
    setSending(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/send-nps", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ eventId: sendEventId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaveMsg({ ok: true, msg: `${data.sent ?? 0}件のNPSメールを送信しました` });
        // Reload NPS data after sending
        reload();
      } else {
        setSaveMsg({ ok: false, msg: data.error || "送信に失敗しました" });
      }
    } catch {
      setSaveMsg({ ok: false, msg: "ネットワークエラーが発生しました" });
    } finally {
      setSending(false);
    }
  };

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
          <p className="text-sm text-gray-400 dark:text-gray-500">NPSダッシュボードを読み込み中...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title={IS_DEMO_MODE ? "NPSダッシュボード (Demo)" : "NPSダッシュボード"}
        badge={`回答 ${totalAnswered}件`}
        onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* === 1. Control Bar === */}
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
            aria-label="イベントフィルター"
            className={inputCls + " max-w-xs"}
          >
            <option value="all">全イベント</option>
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>{evt.name}</option>
            ))}
          </select>
        </div>

        {/* === Send NPS Section (inline) === */}
        <Card>
          <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">NPSメール送信</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            イベントを選択して参加者にNPSアンケートメールを送信します。
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="nps-send-event" className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">
                送信対象イベント
              </label>
              <select
                id="nps-send-event"
                value={sendEventId}
                onChange={(e) => setSendEventId(e.target.value)}
                aria-label="NPS送信対象イベント"
                className={inputCls + " w-full"}
              >
                <option value="">イベントを選択...</option>
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>{evt.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSendNps}
              disabled={sending || !sendEventId || sendableCount === 0}
              aria-label="NPSメールを送信"
              className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-bold text-sm hover:from-blue-600 hover:to-purple-600 disabled:opacity-50 transition-all shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              {sending ? "送信中..." : "NPSメールを送信"}
            </button>
          </div>
          {sendEventId && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              参加者: {sendParticipants.length}名 / メールあり: {sendableCount}名
            </p>
          )}
          {saveMsg && (
            <p className={`text-xs mt-2 ${saveMsg.ok ? "text-green-500" : "text-red-500"}`} role="status" aria-live="polite">
              {saveMsg.msg}
            </p>
          )}
        </Card>

        {/* === 2. NPS Gauge === */}
        <Card className="text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Net Promoter Score</p>
          <p
            className="text-6xl font-extrabold mb-2"
            style={{ color: npsColor(npsResult.nps) }}
          >
            {npsResult.total > 0 ? (npsResult.nps > 0 ? `+${npsResult.nps}` : String(npsResult.nps)) : "---"}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            回答数: {totalAnswered} / 送信数: {totalSent} (回答率 {responseRate}%)
          </p>
        </Card>

        {/* === 3. KPI Cards Row === */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "NPSスコア", value: npsResult.total > 0 ? String(npsResult.nps) : "---", icon: "N", color: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
            { label: "推奨者", value: `${npsResult.promoters}名 (${promoterPct}%)`, icon: "P", color: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
            { label: "中立者", value: `${npsResult.passives}名 (${passivePct}%)`, icon: "A", color: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
            { label: "批判者", value: `${npsResult.detractors}名 (${detractorPct}%)`, icon: "D", color: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
          ].map((s) => (
            <Card key={s.label} className="text-center">
              <div className={`inline-flex w-10 h-10 rounded-full items-center justify-center text-lg font-bold mb-2 ${s.color}`}>
                {s.icon}
              </div>
              <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{s.value}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{s.label}</p>
            </Card>
          ))}
        </div>

        {npsResult.total === 0 ? (
          <Card>
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              まだNPS回答データがありません。NPSメールを送信するとデータが表示されます。
            </p>
          </Card>
        ) : (
          <>
            {/* === 4. Promoter/Passive/Detractor Pie Chart === */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">回答者分布</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={({ name, percent }: any) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                      labelLine={false}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend content={() => (
                      <div className="flex justify-center gap-4 mt-2">
                        {[
                          { label: "推奨者 (9-10)", color: NPS_COLORS.promoter },
                          { label: "中立者 (7-8)", color: NPS_COLORS.passive },
                          { label: "批判者 (0-6)", color: NPS_COLORS.detractor },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                            <span className="text-xs text-gray-500 dark:text-gray-400">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    )} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              {/* === 5. Score Distribution Bar Chart === */}
              <Card>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">スコア分布</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={scoreDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.2} />
                    <XAxis dataKey="score" tick={{ fontSize: 12 }} label={{ value: "スコア", position: "insideBottom", offset: -5, fontSize: 11, fill: "#9CA3AF" }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any) => [`${value}件`, "回答数"]}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {scoreDistribution.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* === 6. Event Comparison Bar Chart === */}
            {eventComparison.length > 1 && (
              <Card>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">イベント別NPS比較</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={eventComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis domain={[-100, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      labelFormatter={(label: any) => {
                        const item = eventComparison.find((e) => e.name === label);
                        return item?.fullName || String(label);
                      }}
                    />
                    <Legend content={() => (
                      <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full flex-shrink-0 bg-[#6EC6FF]" />
                          <span className="text-xs text-gray-500 dark:text-gray-400">NPSスコア</span>
                        </div>
                      </div>
                    )} />
                    <Bar dataKey="NPS" fill="#6EC6FF" radius={[4, 4, 0, 0]}>
                      {eventComparison.map((entry, index) => (
                        <Cell key={index} fill={entry.NPS >= 0 ? "#22C55E" : "#EF4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* === 7. NPS Trend Over Time === */}
            {trendData.length > 1 && (
              <Card>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">NPS推移（週別）</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.2} />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                    <YAxis domain={[-100, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any, name: any) => {
                        if (name === "NPS") return [value, "NPSスコア"];
                        return [`${value}件`, "回答数"];
                      }}
                    />
                    <Legend content={() => (
                      <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full flex-shrink-0 bg-[#6EC6FF]" />
                          <span className="text-xs text-gray-500 dark:text-gray-400">NPSスコア</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full flex-shrink-0 bg-[#A78BFA]" />
                          <span className="text-xs text-gray-500 dark:text-gray-400">回答数</span>
                        </div>
                      </div>
                    )} />
                    <Line type="monotone" dataKey="NPS" stroke="#6EC6FF" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="回答数" stroke="#A78BFA" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* === 8. Recent Comments Table === */}
            <Card>
              <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">最新コメント</h3>
              {recentComments.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                  コメント付きの回答はまだありません。
                </p>
              ) : (
                <div className="overflow-x-auto touch-pan-x">
                  <table className="w-full text-xs min-w-[600px]">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-600">
                        <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">名前</th>
                        <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">イベント</th>
                        <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">スコア</th>
                        <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">コメント</th>
                        <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">回答日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentComments.map((r) => (
                        <tr key={r.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="py-2 px-2 text-gray-700 dark:text-gray-200 whitespace-nowrap">
                            {r.participantName}
                          </td>
                          <td className="py-2 px-2 text-gray-500 dark:text-gray-400 max-w-[120px] truncate">
                            {r.eventName}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span
                              className="inline-flex w-7 h-7 rounded-full items-center justify-center text-white font-bold text-xs"
                              style={{ backgroundColor: scoreBarColor(r.score ?? 0) }}
                            >
                              {r.score ?? "-"}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-gray-600 dark:text-gray-300 max-w-[250px]">
                            <p className="line-clamp-2">{r.comment}</p>
                          </td>
                          <td className="py-2 px-2 text-gray-400 dark:text-gray-500 whitespace-nowrap">
                            {r.respondedAt ? formatDate(r.respondedAt) : "---"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {recentComments.length > 0 && filtered.filter((r) => r.comment && r.comment.trim().length > 0).length > 20 && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-center">
                  最新20件を表示中（全{filtered.filter((r) => r.comment && r.comment.trim().length > 0).length}件）
                </p>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

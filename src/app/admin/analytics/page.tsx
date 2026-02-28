"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, AreaChart, Area,
} from "recharts";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredAnalytics, getStoredEvents, getStoredSurvey,
  getSurveyForEvent, clearAnalytics,
} from "@/lib/store";
import { AnalyticsRecord, EventData, SurveyQuestion, InterestTag } from "@/lib/types";
import { IS_DEMO_MODE } from "@/lib/demo";

const COLORS = [
  "#6EC6FF", "#FF6B8A", "#50D9A0", "#FFB86C", "#BD93F9",
  "#8BE9FD", "#FF79C6", "#F1FA8C", "#FF5555", "#44B8FF",
];

const STEP_LABELS = ["アクセス", "アンケート", "CM視聴", "写真閲覧", "DL完了"];
const STEP_KEYS: (keyof AnalyticsRecord["stepsCompleted"])[] = ["access", "survey", "cmViewed", "photosViewed", "downloaded"];
const STEP_COLORS = ["#60A5FA", "#34D399", "#FBBF24", "#F472B6", "#A78BFA"];

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";

function toShortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession();

  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [survey, setSurvey] = useState<SurveyQuestion[]>([]);
  const [filterEvent, setFilterEvent] = useState("all");

  const tenantId = session?.user?.tenantId ?? (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ?? null;

  // Period filter
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const reload = useCallback(() => {
    if (tenantId) {
      const tenantEvents = getStoredEvents().filter((e) => e.tenantId === tenantId);
      const tenantEventIds = new Set(tenantEvents.map((e) => e.id));
      setEvents(tenantEvents);
      setAnalytics(getStoredAnalytics().filter((a) => tenantEventIds.has(a.eventId)));
    } else {
      setAnalytics(getStoredAnalytics());
      setEvents(getStoredEvents());
    }
    setSurvey(getStoredSurvey());
  }, [tenantId]);

  useEffect(() => { if (status === "authenticated") reload(); }, [status, reload]);

  useEffect(() => {
    if (filterEvent !== "all") {
      setSurvey(getSurveyForEvent(filterEvent));
    } else {
      setSurvey(getStoredSurvey());
    }
  }, [filterEvent]);

  // --- Filtered records (event + date range) ---
  const filtered = useMemo(() => {
    let r = analytics;
    if (filterEvent !== "all") r = r.filter((a) => a.eventId === filterEvent);
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      r = r.filter((a) => a.timestamp >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59").getTime();
      r = r.filter((a) => a.timestamp <= to);
    }
    return r;
  }, [analytics, filterEvent, dateFrom, dateTo]);

  const answered = useMemo(() => filtered.filter((r) => r.surveyAnswers), [filtered]);

  // --- Summary stats ---
  const summary = useMemo(() => {
    const total = filtered.length;
    const surveyDone = filtered.filter((r) => r.stepsCompleted.survey).length;
    const cmDone = filtered.filter((r) => r.stepsCompleted.cmViewed).length;
    const photosDone = filtered.filter((r) => r.stepsCompleted.photosViewed).length;
    const dlDone = filtered.filter((r) => r.stepsCompleted.downloaded).length;
    return {
      total,
      surveyDone,
      surveyRate: total > 0 ? Math.round((surveyDone / total) * 100) : 0,
      cmDone,
      cmRate: total > 0 ? Math.round((cmDone / total) * 100) : 0,
      photosDone,
      dlDone,
      dlRate: total > 0 ? Math.round((dlDone / total) * 100) : 0,
      answered: answered.length,
    };
  }, [filtered, answered]);

  // --- Completion rate funnel ---
  const funnelData = useMemo(() => {
    const total = filtered.length;
    if (total === 0) return [];
    return STEP_KEYS.map((k, i) => {
      const count = filtered.filter((r) => r.stepsCompleted[k]).length;
      return {
        step: STEP_LABELS[i],
        count,
        rate: Math.round((count / total) * 100),
        color: STEP_COLORS[i],
      };
    });
  }, [filtered]);

  // --- Dropout rate between steps ---
  const dropoutData = useMemo(() => {
    if (filtered.length === 0) return [];
    const stepCounts = STEP_KEYS.map((k) => filtered.filter((r) => r.stepsCompleted[k]).length);
    const result = [];
    for (let i = 1; i < STEP_KEYS.length; i++) {
      const prev = stepCounts[i - 1];
      const curr = stepCounts[i];
      const dropped = prev - curr;
      const dropPct = prev > 0 ? Math.round((dropped / prev) * 100) : 0;
      result.push({
        transition: `${STEP_LABELS[i - 1]} → ${STEP_LABELS[i]}`,
        dropRate: dropPct,
        dropped,
        continued: curr,
      });
    }
    return result;
  }, [filtered]);

  // --- Daily trend with completion breakdown ---
  const dailyTrendDetailed = useMemo(() => {
    const dayMap = new Map<string, {
      ts: number; access: number; survey: number; cm: number; photos: number; dl: number;
    }>();
    for (const r of filtered) {
      const key = toShortDate(r.timestamp);
      if (!dayMap.has(key)) dayMap.set(key, { ts: r.timestamp, access: 0, survey: 0, cm: 0, photos: 0, dl: 0 });
      const d = dayMap.get(key)!;
      if (r.stepsCompleted.access) d.access++;
      if (r.stepsCompleted.survey) d.survey++;
      if (r.stepsCompleted.cmViewed) d.cm++;
      if (r.stepsCompleted.photosViewed) d.photos++;
      if (r.stepsCompleted.downloaded) d.dl++;
    }
    return Array.from(dayMap.entries())
      .sort((a, b) => a[1].ts - b[1].ts)
      .slice(-30)
      .map(([date, d]) => ({
        date,
        access: d.access,
        survey: d.survey,
        cm: d.cm,
        dl: d.dl,
        dropoutRate: d.access > 0 ? Math.round(((d.access - d.dl) / d.access) * 100) : 0,
      }));
  }, [filtered]);

  // --- Per-question aggregation ---
  const questionStats = useMemo(() => {
    return survey.map((q) => {
      const counts: Record<string, number> = {};
      for (const opt of q.options) counts[opt.tag] = 0;
      for (const r of answered) {
        const tags = r.surveyAnswers?.[q.id] || [];
        for (const t of tags) { counts[t] = (counts[t] || 0) + 1; }
      }
      const chartData = q.options.map((opt) => ({
        name: opt.label,
        tag: opt.tag,
        count: counts[opt.tag] || 0,
        pct: answered.length > 0 ? Math.round(((counts[opt.tag] || 0) / answered.length) * 100) : 0,
      }));
      return { question: q, chartData, total: answered.length };
    });
  }, [survey, answered]);

  // --- Global tag distribution ---
  const tagDistribution = useMemo(() => {
    const tagCounts = new Map<InterestTag, number>();
    const tagLabels = new Map<InterestTag, string>();
    for (const q of survey) {
      for (const opt of q.options) tagLabels.set(opt.tag, opt.label);
    }
    for (const r of answered) {
      if (!r.surveyAnswers) continue;
      for (const tags of Object.values(r.surveyAnswers)) {
        for (const t of tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
    }
    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({
        tag, label: tagLabels.get(tag) || tag, count,
        pct: answered.length > 0 ? Math.round((count / answered.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [survey, answered]);

  // --- Radar data ---
  const radarData = useMemo(() => {
    if (tagDistribution.length === 0) return [];
    const max = Math.max(...tagDistribution.map((t) => t.count), 1);
    return tagDistribution.slice(0, 8).map((t) => ({ label: t.label, value: t.count, fullMark: max }));
  }, [tagDistribution]);

  // --- Per-event comparison ---
  const eventComparison = useMemo(() => {
    return events.map((evt) => {
      const evtRecords = analytics.filter((r) => r.eventId === evt.id);
      const evtAnswered = evtRecords.filter((r) => r.surveyAnswers);
      return {
        name: evt.name.length > 10 ? evt.name.slice(0, 10) + "..." : evt.name,
        fullName: evt.name,
        responses: evtRecords.length,
        surveyed: evtAnswered.length,
        downloaded: evtRecords.filter((r) => r.stepsCompleted.downloaded).length,
      };
    }).filter((e) => e.responses > 0);
  }, [events, analytics]);

  const handleClear = () => { clearAnalytics(); setAnalytics([]); };

  // --- CSV export ---
  const exportCsv = () => {
    const tagLabelMap = new Map<string, string>();
    for (const q of survey) {
      for (const opt of q.options) tagLabelMap.set(opt.tag, opt.label);
    }
    const eventMap = new Map(events.map((e) => [e.id, e.name]));
    const header = ["名前", "イベント", "日時", ...survey.map((q) => q.question), "DL完了"];
    const rows = [header.join(",")];
    for (const r of answered) {
      const name = r.respondentName || "匿名";
      const evtName = eventMap.get(r.eventId) || r.eventId;
      const dt = new Date(r.timestamp);
      const dateStr = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
      const answers = survey.map((q) => {
        const tags = r.surveyAnswers?.[q.id] || [];
        return tags.map((t) => tagLabelMap.get(t) || t).join(" / ");
      });
      const dl = r.stepsCompleted.downloaded ? "Yes" : "No";
      const row = [name, evtName, dateStr, ...answers, dl].map((v) =>
        v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
      );
      rows.push(row.join(","));
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `アンケート分析_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          <p className="text-sm text-gray-400 dark:text-gray-500">分析データを読み込み中...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title={IS_DEMO_MODE ? "アンケート分析ダッシュボード (Demo)" : "アンケート分析ダッシュボード"}
        badge={`${summary.total}件アクセス`}
        onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
        actions={
          IS_DEMO_MODE || tenantId ? undefined : (
            <button onClick={handleClear} aria-label="分析データをクリア" className="text-xs text-red-400 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded">データクリア</button>
          )
        }
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Filters: event + date range */}
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
            aria-label="イベントフィルター"
            className={inputCls + " max-w-xs"}
            data-testid="analytics-event-filter"
          >
            <option value="all">全イベント</option>
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>{evt.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 dark:text-gray-400">期間:</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              aria-label="開始日"
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 focus:outline-none focus:border-[#6EC6FF] dark:bg-gray-700 dark:text-gray-100" />
            <span className="text-xs text-gray-400 dark:text-gray-500" aria-hidden="true">~</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              aria-label="終了日"
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 focus:outline-none focus:border-[#6EC6FF] dark:bg-gray-700 dark:text-gray-100" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                aria-label="日付フィルターをクリア"
                className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded">クリア</button>
            )}
          </div>
          <button onClick={exportCsv}
            aria-label="分析データをCSVエクスポート"
            className="text-xs px-4 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium ml-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400">
            CSVエクスポート
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "総アクセス", value: String(summary.total), icon: "A", color: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
            { label: "アンケート回答", value: String(summary.answered), icon: "Q", color: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
            { label: "回答率", value: `${summary.surveyRate}%`, icon: "%", color: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
            { label: "DL完了", value: String(summary.dlDone), icon: "D", color: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
            { label: "DL率", value: `${summary.dlRate}%`, icon: "R", color: "bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400" },
          ].map((s) => (
            <Card key={s.label} className="text-center">
              <div className={`inline-flex w-9 h-9 rounded-full items-center justify-center text-sm font-bold mb-1.5 ${s.color}`}>
                {s.icon}
              </div>
              <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{s.value}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* === Completion Rate Funnel === */}
        {funnelData.length > 0 && (
          <Card>
            <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">全体完了率ファネル</h3>
            <div className="space-y-3">
              {funnelData.map((d, i) => (
                <div key={d.step} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-20 flex-shrink-0 text-right">{d.step}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-6 overflow-hidden relative">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${d.rate}%`, backgroundColor: d.color }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700 dark:text-gray-200">
                      {d.count}人 ({d.rate}%)
                    </span>
                  </div>
                  {i > 0 && funnelData[i - 1].count > 0 && (
                    <span className={`text-[10px] font-bold w-16 text-right ${
                      d.rate < funnelData[i - 1].rate * 0.5 ? "text-red-500" : "text-gray-400 dark:text-gray-500"
                    }`}>
                      -{funnelData[i - 1].count - d.count}人
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Funnel bar chart */}
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={funnelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="step" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, _name: any, props: any) =>
                      [`${value}人 (${props?.payload?.rate ?? 0}%)`, "完了数"]
                    }
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {funnelData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* === Dropout Rate Analysis === */}
        {dropoutData.length > 0 && (
          <Card>
            <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">STEP間離脱率分析</h3>
            <div className="space-y-2">
              {dropoutData.map((d) => {
                const bg = d.dropRate >= 50
                  ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                  : d.dropRate >= 25
                    ? "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
                    : "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400";
                return (
                  <div key={d.transition} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-40 flex-shrink-0">{d.transition}</span>
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${d.dropRate}%` }} />
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${bg}`}>
                      -{d.dropped}人 ({d.dropRate}%)
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Dropout bar chart */}
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dropoutData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="transition" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => [`${value}%`, "離脱率"]}
                  />
                  <Bar dataKey="dropRate" name="離脱率" fill="#F87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* === Daily Trend with Completion + Dropout Rate === */}
        {dailyTrendDetailed.length > 1 && (
          <Card>
            <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">期間別トレンド（直近30日）</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dailyTrendDetailed}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="access" name="アクセス" stroke="#60A5FA" fill="#60A5FA" fillOpacity={0.15} />
                <Area type="monotone" dataKey="survey" name="アンケート" stroke="#34D399" fill="#34D399" fillOpacity={0.1} />
                <Area type="monotone" dataKey="cm" name="CM視聴" stroke="#FBBF24" fill="#FBBF24" fillOpacity={0.1} />
                <Area type="monotone" dataKey="dl" name="DL完了" stroke="#A78BFA" fill="#A78BFA" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>

            {/* Dropout rate trend line */}
            <h4 className="font-bold text-gray-600 dark:text-gray-300 mt-4 mb-2 text-sm">離脱率推移</h4>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={dailyTrendDetailed}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`${value}%`, "離脱率"]}
                />
                <Line type="monotone" dataKey="dropoutRate" name="離脱率" stroke="#F87171" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {answered.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              まだアンケート回答データがありません。ユーザーがアンケートに回答すると分析結果が表示されます。
            </p>
          </Card>
        ) : (
          <>
            {/* Per-question charts */}
            {questionStats.map((qs, qi) => (
              <Card key={qs.question.id}>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-1">Q{qi + 1}. {qs.question.question}</h3>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-4">{qs.total}件回答</p>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <ResponsiveContainer width="100%" height={Math.max(qs.chartData.length * 40, 120)}>
                      <BarChart data={qs.chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                        <Tooltip
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any, _name: any, props: any) =>
                            [`${value}件 (${props?.payload?.pct ?? 0}%)`, "回答数"]
                          }
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {qs.chartData.map((_entry, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={qs.chartData.filter((d) => d.count > 0)}
                          cx="50%" cy="50%" innerRadius={40} outerRadius={80}
                          paddingAngle={2} dataKey="count"
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          label={({ name, pct }: any) => `${name} ${pct ?? 0}%`}
                          labelLine={false}
                        >
                          {qs.chartData.filter((d) => d.count > 0).map((_entry, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <Tooltip formatter={(value: any, _name: any, props: any) =>
                          [`${value}件 (${props?.payload?.pct ?? 0}%)`, ""]
                        } />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {qs.chartData.map((d, i) => (
                    <div key={d.tag} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-gray-600 dark:text-gray-300 flex-1">{d.name}</span>
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{d.count}件</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 w-12 text-right">{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}

            {/* Tag distribution radar */}
            {radarData.length >= 3 && (
              <Card>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">タグ分布レーダー</h3>
                <div className="flex justify-center">
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#e0e0e0" />
                      <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis tick={{ fontSize: 10 }} />
                      <Radar name="選択数" dataKey="value" stroke="#6EC6FF" fill="#6EC6FF" fillOpacity={0.3} />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* Tag distribution bar */}
            <Card>
              <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">タグ別選択数ランキング</h3>
              <ResponsiveContainer width="100%" height={Math.max(tagDistribution.length * 32, 120)}>
                <BarChart data={tagDistribution} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={80} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip formatter={(value: any, _name: any, props: any) =>
                    [`${value}件 (${props?.payload?.pct ?? 0}%)`, "選択数"]
                  } />
                  <Bar dataKey="count" name="選択数" radius={[0, 4, 4, 0]}>
                    {tagDistribution.map((_entry, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Event comparison */}
            {eventComparison.length > 1 && (
              <Card>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">イベント別比較</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={eventComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      labelFormatter={(label: any) => {
                        const item = eventComparison.find((e) => e.name === label);
                        return item?.fullName || String(label);
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="responses" name="アクセス" fill="#6EC6FF" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="surveyed" name="回答" fill="#50D9A0" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="downloaded" name="DL完了" fill="#FFB86C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Recent responses table */}
            <Card>
              <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">最新回答一覧</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">名前</th>
                      <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">イベント</th>
                      <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">日時</th>
                      {survey.map((q, i) => (
                        <th key={q.id} className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">Q{i + 1}</th>
                      ))}
                      <th className="text-center py-2 text-gray-500 dark:text-gray-400 font-medium">DL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {answered.slice().reverse().slice(0, 30).map((r) => {
                      const dt = new Date(r.timestamp);
                      const evtName = events.find((e) => e.id === r.eventId)?.name || r.eventId;
                      return (
                        <tr key={r.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="py-1.5 text-gray-700 dark:text-gray-200">{r.respondentName || "匿名"}</td>
                          <td className="py-1.5 text-gray-500 dark:text-gray-400 max-w-[100px] truncate">{evtName}</td>
                          <td className="py-1.5 text-gray-400 dark:text-gray-500 whitespace-nowrap">
                            {dt.getMonth() + 1}/{dt.getDate()} {String(dt.getHours()).padStart(2, "0")}:{String(dt.getMinutes()).padStart(2, "0")}
                          </td>
                          {survey.map((q) => {
                            const tags = r.surveyAnswers?.[q.id] || [];
                            const labels = tags.map((t) => {
                              const opt = q.options.find((o) => o.tag === t);
                              return opt?.label || t;
                            });
                            return (
                              <td key={q.id} className="py-1.5">
                                <div className="flex flex-wrap gap-0.5">
                                  {labels.map((l) => (
                                    <span key={l} className="text-[10px] bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded">{l}</span>
                                  ))}
                                </div>
                              </td>
                            );
                          })}
                          <td className="py-1.5 text-center">
                            <span className={r.stepsCompleted.downloaded ? "text-green-500" : "text-gray-300 dark:text-gray-500"}>
                              {r.stepsCompleted.downloaded ? "OK" : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {answered.length > 30 && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-center">最新30件を表示中（全{answered.length}件）</p>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import { ADMIN_PASSWORD } from "@/lib/data";
import {
  getStoredAnalytics, getStoredEvents, getStoredSurvey,
  getSurveyForEvent, clearAnalytics, getStoredTenants,
} from "@/lib/store";
import { AnalyticsRecord, EventData, SurveyQuestion, InterestTag } from "@/lib/types";
import { IS_DEMO_MODE } from "@/lib/demo";

const COLORS = [
  "#6EC6FF", "#FF6B8A", "#50D9A0", "#FFB86C", "#BD93F9",
  "#8BE9FD", "#FF79C6", "#F1FA8C", "#FF5555", "#44B8FF",
];

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm";

export default function AnalyticsPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");

  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [survey, setSurvey] = useState<SurveyQuestion[]>([]);
  const [filterEvent, setFilterEvent] = useState("all");
  const [tenantId, setTenantId] = useState<string | null>(null);

  const reload = useCallback(() => {
    const tid = typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") || null : null;
    setTenantId(tid);
    if (tid) {
      const tenantEvents = getStoredEvents().filter((e) => e.tenantId === tid);
      const tenantEventIds = new Set(tenantEvents.map((e) => e.id));
      setEvents(tenantEvents);
      setAnalytics(getStoredAnalytics().filter((a) => tenantEventIds.has(a.eventId)));
    } else {
      setAnalytics(getStoredAnalytics());
      setEvents(getStoredEvents());
    }
    setSurvey(getStoredSurvey());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Update survey when event filter changes
  useEffect(() => {
    if (filterEvent !== "all") {
      setSurvey(getSurveyForEvent(filterEvent));
    } else {
      setSurvey(getStoredSurvey());
    }
  }, [filterEvent]);

  useEffect(() => {
    if (sessionStorage.getItem("adminAuthed") === "true") setAuthed(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      setAuthed(true);
      sessionStorage.setItem("adminAuthed", "true");
      sessionStorage.removeItem("adminTenantId");
    } else {
      const tenants = getStoredTenants();
      const tenant = tenants.find((t) => t.adminPassword === pw.toUpperCase());
      if (tenant) {
        if (tenant.isActive === false) {
          setPwError("このテナントは無効化されています");
          return;
        }
        if (tenant.licenseEnd && new Date(tenant.licenseEnd + "T23:59:59") < new Date()) {
          setPwError("ライセンスが期限切れです");
          return;
        }
        setAuthed(true);
        sessionStorage.setItem("adminAuthed", "true");
        sessionStorage.setItem("adminTenantId", tenant.id);
        setTenantId(tenant.id);
      } else {
        setPwError("パスワードが違います");
      }
    }
  };

  // --- Filtered records ---
  const filtered = useMemo(() => {
    let r = analytics;
    if (filterEvent !== "all") r = r.filter((a) => a.eventId === filterEvent);
    return r;
  }, [analytics, filterEvent]);

  const answered = useMemo(() => filtered.filter((r) => r.surveyAnswers), [filtered]);

  // --- Summary stats ---
  const summary = useMemo(() => {
    const total = filtered.length;
    const surveyDone = filtered.filter((r) => r.stepsCompleted.survey).length;
    const dlDone = filtered.filter((r) => r.stepsCompleted.downloaded).length;
    return {
      total,
      surveyDone,
      surveyRate: total > 0 ? Math.round((surveyDone / total) * 100) : 0,
      dlDone,
      dlRate: total > 0 ? Math.round((dlDone / total) * 100) : 0,
      answered: answered.length,
    };
  }, [filtered, answered]);

  // --- Per-question aggregation ---
  const questionStats = useMemo(() => {
    return survey.map((q) => {
      const counts: Record<string, number> = {};
      for (const opt of q.options) counts[opt.tag] = 0;

      for (const r of answered) {
        const tags = r.surveyAnswers?.[q.id] || [];
        for (const t of tags) {
          counts[t] = (counts[t] || 0) + 1;
        }
      }

      const chartData = q.options.map((opt) => ({
        name: opt.label,
        tag: opt.tag,
        count: counts[opt.tag] || 0,
        pct: answered.length > 0
          ? Math.round(((counts[opt.tag] || 0) / answered.length) * 100)
          : 0,
      }));

      return { question: q, chartData, total: answered.length };
    });
  }, [survey, answered]);

  // --- Global tag distribution ---
  const tagDistribution = useMemo(() => {
    const tagCounts = new Map<InterestTag, number>();
    const tagLabels = new Map<InterestTag, string>();

    // Build label map from survey
    for (const q of survey) {
      for (const opt of q.options) {
        tagLabels.set(opt.tag, opt.label);
      }
    }

    for (const r of answered) {
      if (!r.surveyAnswers) continue;
      for (const tags of Object.values(r.surveyAnswers)) {
        for (const t of tags) {
          tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
        }
      }
    }

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({
        tag,
        label: tagLabels.get(tag) || tag,
        count,
        pct: answered.length > 0 ? Math.round((count / answered.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [survey, answered]);

  // --- Radar data for tag categories ---
  const radarData = useMemo(() => {
    if (tagDistribution.length === 0) return [];
    const max = Math.max(...tagDistribution.map((t) => t.count), 1);
    return tagDistribution.slice(0, 8).map((t) => ({
      label: t.label,
      value: t.count,
      fullMark: max,
    }));
  }, [tagDistribution]);

  // --- Daily response trend ---
  const dailyTrend = useMemo(() => {
    const dayMap = new Map<string, number>();
    for (const r of filtered) {
      const d = new Date(r.timestamp);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      dayMap.set(key, (dayMap.get(key) || 0) + 1);
    }
    return Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));
  }, [filtered]);

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

  // --- Login screen ---
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-800 text-center mb-4">
            アンケート分析
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="管理パスワード"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-center"
              data-testid="analytics-password"
            />
            {pwError && <p className="text-red-400 text-sm text-center">{pwError}</p>}
            <Button type="submit" size="md" className="w-full">ログイン</Button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <AdminHeader
        title={IS_DEMO_MODE ? "アンケート分析ダッシュボード (Demo)" : "アンケート分析ダッシュボード"}
        badge={`${summary.answered}件回答`}
        onLogout={() => { setAuthed(false); sessionStorage.removeItem("adminAuthed"); }}
        actions={
          IS_DEMO_MODE || tenantId ? undefined : (
            <button onClick={handleClear} className="text-xs text-red-400 hover:text-red-600">
              データクリア
            </button>
          )
        }
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
            className={inputCls + " max-w-xs"}
            data-testid="analytics-event-filter"
          >
            <option value="all">全イベント</option>
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>{evt.name}</option>
            ))}
          </select>
          <button
            onClick={exportCsv}
            className="text-xs px-4 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium ml-auto"
          >
            CSVエクスポート
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "総アクセス", value: String(summary.total), icon: "👥", color: "bg-blue-50 text-blue-600" },
            { label: "アンケート回答", value: String(summary.answered), icon: "📝", color: "bg-green-50 text-green-600" },
            { label: "回答率", value: `${summary.surveyRate}%`, icon: "📊", color: "bg-purple-50 text-purple-600" },
            { label: "DL完了", value: String(summary.dlDone), icon: "📥", color: "bg-yellow-50 text-yellow-700" },
            { label: "DL率", value: `${summary.dlRate}%`, icon: "✓", color: "bg-pink-50 text-pink-600" },
          ].map((s) => (
            <Card key={s.label} className="text-center">
              <div className={`inline-flex w-9 h-9 rounded-full items-center justify-center text-base mb-1.5 ${s.color}`}>
                {s.icon}
              </div>
              <p className="text-xl font-bold text-gray-800">{s.value}</p>
              <p className="text-[10px] text-gray-400">{s.label}</p>
            </Card>
          ))}
        </div>

        {answered.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-400 text-center py-8">
              まだアンケート回答データがありません。ユーザーがアンケートに回答すると分析結果が表示されます。
            </p>
          </Card>
        ) : (
          <>
            {/* Daily trend */}
            {dailyTrend.length > 1 && (
              <Card>
                <h3 className="font-bold text-gray-700 mb-4">日別アクセス推移</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="アクセス数" fill="#6EC6FF" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Per-question charts */}
            {questionStats.map((qs, qi) => (
              <Card key={qs.question.id}>
                <h3 className="font-bold text-gray-700 mb-1">
                  Q{qi + 1}. {qs.question.question}
                </h3>
                <p className="text-[10px] text-gray-400 mb-4">{qs.total}件回答</p>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Bar chart */}
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

                  {/* Pie chart */}
                  <div className="flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={qs.chartData.filter((d) => d.count > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="count"
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

                {/* Table fallback */}
                <div className="mt-3 space-y-1">
                  {qs.chartData.map((d, i) => (
                    <div key={d.tag} className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="text-xs text-gray-600 flex-1">{d.name}</span>
                      <span className="text-xs font-mono text-gray-500">{d.count}件</span>
                      <span className="text-xs text-gray-400 w-12 text-right">{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}

            {/* Tag distribution radar */}
            {radarData.length >= 3 && (
              <Card>
                <h3 className="font-bold text-gray-700 mb-4">タグ分布レーダー</h3>
                <div className="flex justify-center">
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#e0e0e0" />
                      <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis tick={{ fontSize: 10 }} />
                      <Radar
                        name="選択数"
                        dataKey="value"
                        stroke="#6EC6FF"
                        fill="#6EC6FF"
                        fillOpacity={0.3}
                      />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* Tag distribution bar */}
            <Card>
              <h3 className="font-bold text-gray-700 mb-4">タグ別選択数ランキング</h3>
              <ResponsiveContainer width="100%" height={Math.max(tagDistribution.length * 32, 120)}>
                <BarChart
                  data={tagDistribution}
                  layout="vertical"
                  margin={{ left: 0, right: 20 }}
                >
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
                <h3 className="font-bold text-gray-700 mb-4">イベント別比較</h3>
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
              <h3 className="font-bold text-gray-700 mb-3">最新回答一覧</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-gray-500 font-medium">名前</th>
                      <th className="text-left py-2 text-gray-500 font-medium">イベント</th>
                      <th className="text-left py-2 text-gray-500 font-medium">日時</th>
                      {survey.map((q, i) => (
                        <th key={q.id} className="text-left py-2 text-gray-500 font-medium">Q{i + 1}</th>
                      ))}
                      <th className="text-center py-2 text-gray-500 font-medium">DL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {answered.slice().reverse().slice(0, 30).map((r) => {
                      const dt = new Date(r.timestamp);
                      const evtName = events.find((e) => e.id === r.eventId)?.name || r.eventId;
                      return (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-1.5 text-gray-700">{r.respondentName || "匿名"}</td>
                          <td className="py-1.5 text-gray-500 max-w-[100px] truncate">{evtName}</td>
                          <td className="py-1.5 text-gray-400 whitespace-nowrap">
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
                                    <span key={l} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                      {l}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            );
                          })}
                          <td className="py-1.5 text-center">
                            <span className={r.stepsCompleted.downloaded ? "text-green-500" : "text-gray-300"}>
                              {r.stepsCompleted.downloaded ? "✓" : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {answered.length > 30 && (
                <p className="text-[10px] text-gray-400 mt-2 text-center">最新30件を表示中（全{answered.length}件）</p>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

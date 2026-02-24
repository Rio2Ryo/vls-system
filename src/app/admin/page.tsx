"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ADMIN_PASSWORD } from "@/lib/data";
import { Company, CompanyTier, EventData, InterestTag, PhotoData, SurveyQuestion } from "@/lib/types";
import {
  getStoredEvents, setStoredEvents,
  getStoredCompanies, setStoredCompanies,
  getStoredSurvey, setStoredSurvey,
  getStoredAnalytics, clearAnalytics,
  resetToDefaults,
} from "@/lib/store";
import { AnalyticsRecord } from "@/lib/types";

type Tab = "events" | "photos" | "companies" | "survey" | "dashboard";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      setAuthed(true);
    } else {
      setPwError("パスワードが違います");
    }
  };

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-800 text-center mb-4">
            管理画面ログイン
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="管理パスワード"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-center"
              data-testid="admin-password"
            />
            {pwError && <p className="text-red-400 text-sm text-center">{pwError}</p>}
            <Button type="submit" size="md" className="w-full">
              ログイン
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "dashboard", label: "ダッシュボード", icon: "📊" },
    { key: "events", label: "イベント管理", icon: "🎪" },
    { key: "photos", label: "写真管理", icon: "📷" },
    { key: "companies", label: "企業管理", icon: "🏢" },
    { key: "survey", label: "アンケート", icon: "📝" },
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="font-bold text-gray-800">VLS Admin</h1>
          <div className="flex items-center gap-3">
            <a
              href="/admin/stats"
              className="text-xs text-[#6EC6FF] hover:underline font-medium"
            >
              CM統計
            </a>
            <button
              onClick={() => { resetToDefaults(); showToast("デフォルトに戻しました"); }}
              className="text-xs text-gray-400 hover:text-red-500"
              data-testid="admin-reset"
            >
              リセット
            </button>
            <button
              onClick={() => setAuthed(false)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Tab navigation */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? "bg-[#6EC6FF] text-white shadow-sm"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 px-4 py-2 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm text-center"
              data-testid="admin-toast"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "dashboard" && <DashboardTab />}
            {tab === "events" && <EventsTab onSave={showToast} />}
            {tab === "photos" && <PhotosTab onSave={showToast} />}
            {tab === "companies" && <CompaniesTab onSave={showToast} />}
            {tab === "survey" && <SurveyTab onSave={showToast} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

// --- Shared input style ---
const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm";

// ===== CSV Export =====
function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportSurveyCsv(
  records: AnalyticsRecord[],
  questions: SurveyQuestion[],
  events: EventData[]
) {
  const eventMap = new Map(events.map((e) => [e.id, e.name]));

  // Build tag-to-label map from questions
  const tagLabelMap = new Map<string, string>();
  for (const q of questions) {
    for (const opt of q.options) {
      tagLabelMap.set(opt.tag, opt.label);
    }
  }

  // CSV header
  const headerCols = [
    "名前",
    "イベント名",
    "回答日時",
    ...questions.map((q) => q.question),
    "DL完了",
  ];
  const rows: string[] = [headerCols.map(escapeCsvField).join(",")];

  // CSV rows
  for (const r of records) {
    const name = r.respondentName || "匿名";
    const eventName = eventMap.get(r.eventId) || r.eventId;
    const dt = new Date(r.timestamp);
    const dateStr = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;

    const answerCols = questions.map((q) => {
      const tags = r.surveyAnswers?.[q.id] || [];
      return tags.map((t) => tagLabelMap.get(t) || t).join(" / ");
    });

    const downloaded = r.stepsCompleted.downloaded ? "Yes" : "No";

    const row = [name, eventName, dateStr, ...answerCols, downloaded];
    rows.push(row.map(escapeCsvField).join(","));
  }

  // BOM for Excel compatibility + CSV content
  const bom = "\uFEFF";
  const csvContent = bom + rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `アンケート回答_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== Dashboard =====
function DashboardTab() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [selectedEventFilter, setSelectedEventFilter] = useState<string>("all");

  useEffect(() => {
    setEvents(getStoredEvents());
    setCompanies(getStoredCompanies());
    setAnalytics(getStoredAnalytics());
  }, []);

  const filteredAnalytics = selectedEventFilter === "all"
    ? analytics
    : analytics.filter((r) => r.eventId === selectedEventFilter);

  // Funnel counts
  const funnel = {
    access: filteredAnalytics.filter((r) => r.stepsCompleted.access).length,
    survey: filteredAnalytics.filter((r) => r.stepsCompleted.survey).length,
    cmViewed: filteredAnalytics.filter((r) => r.stepsCompleted.cmViewed).length,
    photosViewed: filteredAnalytics.filter((r) => r.stepsCompleted.photosViewed).length,
    downloaded: filteredAnalytics.filter((r) => r.stepsCompleted.downloaded).length,
  };

  // Survey aggregation
  const surveyQuestions = getStoredSurvey();
  const answeredRecords = filteredAnalytics.filter((r) => r.surveyAnswers);
  const surveyAgg: Record<string, Record<string, number>> = {};
  for (const q of surveyQuestions) {
    surveyAgg[q.id] = {};
    for (const opt of q.options) {
      surveyAgg[q.id][opt.tag] = 0;
    }
  }
  for (const record of answeredRecords) {
    if (!record.surveyAnswers) continue;
    for (const [qId, tags] of Object.entries(record.surveyAnswers)) {
      if (!surveyAgg[qId]) continue;
      for (const tag of tags) {
        surveyAgg[qId][tag] = (surveyAgg[qId][tag] || 0) + 1;
      }
    }
  }

  // CM view aggregation
  const cmViewCounts: Record<string, { matched: number; platinum: number }> = {};
  for (const c of companies) {
    cmViewCounts[c.id] = { matched: 0, platinum: 0 };
  }
  for (const record of filteredAnalytics) {
    if (record.matchedCompanyId && cmViewCounts[record.matchedCompanyId]) {
      cmViewCounts[record.matchedCompanyId].matched++;
    }
    if (record.platinumCompanyId && cmViewCounts[record.platinumCompanyId]) {
      cmViewCounts[record.platinumCompanyId].platinum++;
    }
  }

  // Per-event stats
  const eventStats = events.map((evt) => {
    const evtRecords = analytics.filter((r) => r.eventId === evt.id);
    return {
      event: evt,
      access: evtRecords.filter((r) => r.stepsCompleted.access).length,
      completed: evtRecords.filter((r) => r.stepsCompleted.downloaded).length,
      completionRate: evtRecords.length > 0
        ? Math.round((evtRecords.filter((r) => r.stepsCompleted.downloaded).length / evtRecords.length) * 100)
        : 0,
    };
  });

  const handleClearAnalytics = () => {
    clearAnalytics();
    setAnalytics([]);
  };

  const funnelSteps = [
    { key: "access", label: "アクセス", count: funnel.access, color: "bg-blue-400" },
    { key: "survey", label: "アンケート完了", count: funnel.survey, color: "bg-green-400" },
    { key: "cmViewed", label: "CM視聴完了", count: funnel.cmViewed, color: "bg-yellow-400" },
    { key: "photosViewed", label: "写真閲覧", count: funnel.photosViewed, color: "bg-pink-400" },
    { key: "downloaded", label: "DL完了", count: funnel.downloaded, color: "bg-purple-400" },
  ];
  const maxFunnel = Math.max(funnel.access, 1);

  return (
    <div className="space-y-6" data-testid="admin-dashboard">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "総アクセス数", value: String(analytics.length), icon: "👥", color: "bg-blue-50 text-blue-600" },
          { label: "登録イベント", value: String(events.length), icon: "🎪", color: "bg-yellow-50 text-yellow-700" },
          { label: "パートナー企業", value: String(companies.length), icon: "🏢", color: "bg-pink-50 text-pink-600" },
          { label: "DL完了率", value: analytics.length > 0 ? `${Math.round((funnel.downloaded / analytics.length) * 100)}%` : "—", icon: "📊", color: "bg-green-50 text-green-600" },
        ].map((s) => (
          <Card key={s.label} className="text-center">
            <div className={`inline-flex w-10 h-10 rounded-full items-center justify-center text-lg mb-2 ${s.color}`}>
              {s.icon}
            </div>
            <p className="text-2xl font-bold text-gray-800">{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Event filter */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-700">アクセス・完了ファネル</h3>
          <div className="flex items-center gap-2">
            <select
              value={selectedEventFilter}
              onChange={(e) => setSelectedEventFilter(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#6EC6FF]"
              data-testid="dashboard-event-filter"
            >
              <option value="all">全イベント</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>{evt.name}</option>
              ))}
            </select>
            <button
              onClick={handleClearAnalytics}
              className="text-[10px] text-red-400 hover:text-red-600"
            >
              データクリア
            </button>
          </div>
        </div>

        {/* Funnel visualization */}
        {analytics.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">まだアクセスデータがありません</p>
        ) : (
          <div className="space-y-3">
            {funnelSteps.map((step) => (
              <div key={step.key} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-28 text-right flex-shrink-0">{step.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                  <div
                    className={`h-full rounded-full ${step.color} transition-all duration-500`}
                    style={{ width: `${(step.count / maxFunnel) * 100}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
                    {step.count}
                  </span>
                </div>
                <span className="text-xs text-gray-400 w-12 flex-shrink-0">
                  {funnel.access > 0 ? `${Math.round((step.count / funnel.access) * 100)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Per-event stats table */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-3">イベント別アクセス統計</h3>
        {eventStats.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">イベントが登録されていません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="event-stats-table">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-gray-500 font-medium">イベント名</th>
                  <th className="text-center py-2 text-gray-500 font-medium">アクセス数</th>
                  <th className="text-center py-2 text-gray-500 font-medium">DL完了</th>
                  <th className="text-center py-2 text-gray-500 font-medium">完了率</th>
                </tr>
              </thead>
              <tbody>
                {eventStats.map((es) => (
                  <tr key={es.event.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700">{es.event.name}</td>
                    <td className="py-2 text-center font-mono">{es.access}</td>
                    <td className="py-2 text-center font-mono">{es.completed}</td>
                    <td className="py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        es.completionRate >= 70 ? "bg-green-50 text-green-600" :
                        es.completionRate >= 40 ? "bg-yellow-50 text-yellow-600" :
                        "bg-gray-50 text-gray-500"
                      }`}>
                        {es.access > 0 ? `${es.completionRate}%` : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Survey results aggregation */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-gray-700">アンケート集計結果</h3>
          {answeredRecords.length > 0 && (
            <button
              onClick={() => exportSurveyCsv(answeredRecords, surveyQuestions, events)}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium transition-colors"
              data-testid="csv-export-btn"
            >
              CSVエクスポート
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">回答数: {answeredRecords.length}件</p>

        {answeredRecords.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">まだ回答データがありません</p>
        ) : (
          <div className="space-y-6">
            {surveyQuestions.map((q) => {
              const qData = surveyAgg[q.id] || {};
              const maxCount = Math.max(...Object.values(qData), 1);
              return (
                <div key={q.id} data-testid={`survey-result-${q.id}`}>
                  <p className="text-sm font-bold text-gray-600 mb-2">{q.question}</p>
                  <div className="space-y-1.5">
                    {q.options.map((opt) => {
                      const count = qData[opt.tag] || 0;
                      const pct = answeredRecords.length > 0 ? Math.round((count / answeredRecords.length) * 100) : 0;
                      return (
                        <div key={opt.tag} className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0">{opt.label}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#6EC6FF] transition-all duration-500"
                              style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-600">
                              {count > 0 ? `${count}件 (${pct}%)` : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* CM view stats */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-3">CM表示回数（企業別）</h3>
        {companies.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">企業が登録されていません</p>
        ) : (
          <div className="space-y-3">
            {companies.map((c) => {
              const views = cmViewCounts[c.id] || { matched: 0, platinum: 0 };
              const total = views.matched + views.platinum;
              return (
                <div key={c.id} className="flex items-center gap-3" data-testid={`cm-stats-${c.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.logoUrl} alt={c.name} className="w-8 h-8 rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm text-gray-600 truncate">{c.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase flex-shrink-0">{c.tier}</span>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-blue-500">提供CM: <b>{views.platinum}</b>回</span>
                      <span className="text-green-500">マッチCM: <b>{views.matched}</b>回</span>
                      <span className="text-gray-400">合計: <b>{total}</b>回</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ===== Events =====
function EventsTab({ onSave }: { onSave: (msg: string) => void }) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", date: "", description: "", password: "", companyIds: [] as string[] });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrEventId, setQrEventId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const getShareUrl = (pw: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/?pw=${encodeURIComponent(pw)}`;
  };

  const copyUrl = (evt: EventData) => {
    navigator.clipboard.writeText(getShareUrl(evt.password));
    setCopiedId(evt.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleQr = async (evt: EventData) => {
    if (qrEventId === evt.id) {
      setQrEventId(null);
      setQrDataUrl(null);
      return;
    }
    setQrEventId(evt.id);
    const url = getShareUrl(evt.password);
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: "#333333", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl(null);
    }
  };

  const downloadQr = (evtName: string) => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `QR_${evtName.replace(/\s+/g, "_")}.png`;
    a.click();
  };

  useEffect(() => {
    setEvents(getStoredEvents());
    setCompanies(getStoredCompanies());
  }, []);

  const startNew = () => {
    setEditing("__new__");
    setForm({ name: "", date: "", description: "", password: "", companyIds: [] });
  };

  const startEdit = (evt: EventData) => {
    setEditing(evt.id);
    setForm({ name: evt.name, date: evt.date, description: evt.description, password: evt.password, companyIds: evt.companyIds || [] });
  };

  const toggleCompany = (companyId: string) => {
    setForm((prev) => ({
      ...prev,
      companyIds: prev.companyIds.includes(companyId)
        ? prev.companyIds.filter((id) => id !== companyId)
        : [...prev.companyIds, companyId],
    }));
  };

  const save = () => {
    if (!form.name || !form.password) return;
    let updated: EventData[];
    if (editing === "__new__") {
      const newEvt: EventData = {
        id: `evt-${Date.now()}`,
        name: form.name,
        date: form.date,
        description: form.description,
        password: form.password.toUpperCase(),
        photos: [],
        companyIds: form.companyIds.length > 0 ? form.companyIds : undefined,
      };
      updated = [...events, newEvt];
    } else {
      updated = events.map((e) =>
        e.id === editing
          ? {
              ...e,
              name: form.name,
              date: form.date,
              description: form.description,
              password: form.password.toUpperCase(),
              companyIds: form.companyIds.length > 0 ? form.companyIds : undefined,
            }
          : e
      );
    }
    setStoredEvents(updated);
    setEvents(updated);
    setEditing(null);
    onSave("イベントを保存しました");
  };

  const remove = (id: string) => {
    const updated = events.filter((e) => e.id !== id);
    setStoredEvents(updated);
    setEvents(updated);
    onSave("イベントを削除しました");
  };

  const TIER_COLORS: Record<string, string> = {
    platinum: "bg-blue-100 text-blue-700",
    gold: "bg-yellow-100 text-yellow-700",
    silver: "bg-gray-100 text-gray-600",
    bronze: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="space-y-4" data-testid="admin-events">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">イベント一覧</h2>
        <Button size="sm" onClick={startNew}>+ 新規作成</Button>
      </div>

      {editing && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">{editing === "__new__" ? "新規イベント" : "イベント編集"}</h3>
          <div className="space-y-3">
            <input className={inputCls} placeholder="イベント名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="event-name-input" />
            <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="event-date-input" />
            <input className={inputCls} placeholder="説明" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input className={inputCls + " font-mono uppercase"} placeholder="パスワード（例: SUMMER2026）" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="event-password-input" />

            {/* Company assignment */}
            <div className="border border-gray-100 rounded-xl p-3" data-testid="event-company-assign">
              <p className="text-xs font-bold text-gray-500 mb-2">CM企業の割り当て</p>
              <p className="text-[10px] text-gray-400 mb-2">未選択の場合は全企業のCMが配信されます</p>
              {companies.length === 0 ? (
                <p className="text-xs text-gray-400">企業が登録されていません</p>
              ) : (
                <div className="space-y-1.5">
                  {companies.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={form.companyIds.includes(c.id)}
                        onChange={() => toggleCompany(c.id)}
                        className="rounded border-gray-300 text-[#6EC6FF] focus:ring-[#6EC6FF]"
                        data-testid={`event-company-${c.id}`}
                      />
                      <span className="text-sm text-gray-600 group-hover:text-gray-800">{c.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${TIER_COLORS[c.tier]}`}>
                        {c.tier}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={save}>保存</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>キャンセル</Button>
            </div>
          </div>
        </Card>
      )}

      {events.map((evt) => (
        <Card key={evt.id}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold text-gray-700">{evt.name}</h3>
              <p className="text-sm text-gray-400">{evt.date} · {evt.description}</p>
              <p className="text-xs text-gray-400 mt-1">
                パスワード: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono" data-testid={`event-pw-${evt.id}`}>{evt.password}</code>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
                {evt.photos.length}枚
              </span>
              <button onClick={() => startEdit(evt)} className="text-xs text-[#6EC6FF] hover:underline">編集</button>
              <button onClick={() => remove(evt.id)} className="text-xs text-red-400 hover:underline">削除</button>
            </div>
          </div>

          {/* Associated companies */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-400">CM企業:</span>
            {(!evt.companyIds || evt.companyIds.length === 0) ? (
              <span className="text-[10px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full text-gray-500">全企業</span>
            ) : (
              evt.companyIds.map((cId) => {
                const co = companies.find((c) => c.id === cId);
                return co ? (
                  <span key={cId} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TIER_COLORS[co.tier]}`}>
                    {co.name}
                  </span>
                ) : null;
              })
            )}
          </div>

          {/* User-facing shareable URL */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 mb-1">ユーザー向け共有URL</p>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 text-xs bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg font-mono text-gray-600 truncate"
                data-testid={`event-url-${evt.id}`}
              >
                {getShareUrl(evt.password)}
              </code>
              <button
                onClick={() => copyUrl(evt)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  copiedId === evt.id
                    ? "bg-green-50 text-green-600 border border-green-200"
                    : "bg-[#6EC6FF] text-white hover:bg-blue-400"
                }`}
                data-testid={`event-copy-url-${evt.id}`}
              >
                {copiedId === evt.id ? "Copied!" : "URLコピー"}
              </button>
              <button
                onClick={() => toggleQr(evt)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  qrEventId === evt.id
                    ? "bg-gray-200 text-gray-600"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                data-testid={`event-qr-toggle-${evt.id}`}
              >
                {qrEventId === evt.id ? "QR閉じる" : "QRコード"}
              </button>
            </div>

            {/* QR Code display */}
            <AnimatePresence>
              {qrEventId === evt.id && qrDataUrl && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 flex flex-col items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl" data-testid={`event-qr-${evt.id}`}>
                    <canvas ref={qrCanvasRef} className="hidden" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrDataUrl}
                      alt={`QR Code for ${evt.name}`}
                      className="w-48 h-48"
                      data-testid={`event-qr-image-${evt.id}`}
                    />
                    <p className="text-[10px] text-gray-400 text-center">{getShareUrl(evt.password)}</p>
                    <button
                      onClick={() => downloadQr(evt.name)}
                      className="text-xs px-4 py-2 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors"
                      data-testid={`event-qr-download-${evt.id}`}
                    >
                      QRコードをダウンロード
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ===== Photos =====

/** Upload a file to R2 via presigned token (2-step: presign → PUT). */
async function uploadFileToR2(
  file: File | Blob,
  eventId: string,
  type: "photos" | "thumbs",
  adminPassword: string,
  fileName?: string
): Promise<{ key: string; url: string } | null> {
  try {
    // Step 1: Get presigned token
    const presignRes = await fetch("/api/admin/presign", {
      method: "POST",
      headers: {
        "x-admin-password": adminPassword,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventId,
        fileName: fileName || (file instanceof File ? file.name : "thumb.jpg"),
        contentType: file.type || "image/jpeg",
        type,
      }),
    });
    if (!presignRes.ok) return null;
    const { token, mediaUrl, uploadUrl } = await presignRes.json();

    // Step 2: PUT directly with token
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "x-upload-token": token },
      body: file,
    });
    if (!putRes.ok) return null;
    const result = await putRes.json();
    return { key: result.key, url: mediaUrl };
  } catch {
    return null;
  }
}

function createThumbnailBlob(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, 400, 300);
        canvas.toBlob(
          (blob) => resolve(blob!),
          "image/jpeg",
          0.6
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function PhotosTab({ onSave }: { onSave: (msg: string) => void }) {
  const [events, setEvts] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    const evts = getStoredEvents();
    setEvts(evts);
    if (evts.length > 0) setSelectedEventId(evts[0].id);
  }, []);

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const addPhotos = async (files: FileList) => {
    if (!selectedEvent) return;

    const fileArray = Array.from(files);
    setUploading(true);
    setUploadProgress({ current: 0, total: fileArray.length });

    const newPhotos: PhotoData[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setUploadProgress({ current: i + 1, total: fileArray.length });

      // Try R2 upload first
      const originalResult = await uploadFileToR2(
        file,
        selectedEventId,
        "photos",
        ADMIN_PASSWORD
      );

      let thumbResult: { key: string; url: string } | null = null;
      if (originalResult) {
        const thumbBlob = await createThumbnailBlob(file);
        const thumbFile = new File([thumbBlob], file.name, { type: "image/jpeg" });
        thumbResult = await uploadFileToR2(
          thumbFile,
          selectedEventId,
          "thumbs",
          ADMIN_PASSWORD
        );
      }

      if (originalResult && thumbResult) {
        // R2 upload succeeded
        newPhotos.push({
          id: `uploaded-${Date.now()}-${i}`,
          originalUrl: originalResult.url,
          thumbnailUrl: thumbResult.url,
          watermarked: true,
        });
      } else {
        // Fallback to base64 localStorage
        const dataUrl = await readAsDataUrl(file);
        const thumbBlob = await createThumbnailBlob(file);
        const thumbDataUrl = await readAsDataUrl(new File([thumbBlob], file.name));
        newPhotos.push({
          id: `uploaded-${Date.now()}-${i}`,
          originalUrl: dataUrl,
          thumbnailUrl: thumbDataUrl,
          watermarked: true,
        });
      }
    }

    const updated = events.map((e) =>
      e.id === selectedEventId
        ? { ...e, photos: [...e.photos, ...newPhotos] }
        : e
    );
    setStoredEvents(updated);
    setEvts(updated);
    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    onSave(`${newPhotos.length}枚の写真を追加しました`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) addPhotos(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addPhotos(e.target.files);
  };

  const removePhoto = (photoId: string) => {
    const updated = events.map((e) =>
      e.id === selectedEventId
        ? { ...e, photos: e.photos.filter((p) => p.id !== photoId) }
        : e
    );
    setStoredEvents(updated);
    setEvts(updated);
    onSave("写真を削除しました");
  };

  return (
    <div className="space-y-4" data-testid="admin-photos">
      <h2 className="text-lg font-bold text-gray-800">写真管理</h2>

      {/* Event selector */}
      <Card>
        <label className="text-sm font-bold text-gray-600 mb-2 block">対象イベント</label>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className={inputCls}
          data-testid="photo-event-select"
        >
          {events.map((evt) => (
            <option key={evt.id} value={evt.id}>{evt.name} ({evt.photos.length}枚)</option>
          ))}
        </select>
      </Card>

      {/* Drop zone */}
      <Card>
        <div
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? "border-[#6EC6FF] bg-blue-50" : "border-gray-200 hover:border-[#6EC6FF]"
          } ${uploading ? "pointer-events-none opacity-60" : ""}`}
          data-testid="photo-upload-zone"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && document.getElementById("photo-file-input")?.click()}
        >
          {uploading ? (
            <>
              <div className="text-4xl mb-2 animate-pulse">📤</div>
              <p className="font-medium text-gray-600">
                アップロード中... ({uploadProgress.current}/{uploadProgress.total})
              </p>
              <div className="w-48 mx-auto mt-3 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-[#6EC6FF] h-2 rounded-full transition-all"
                  style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="text-4xl mb-2">📁</div>
              <p className="font-medium text-gray-600">写真をドラッグ＆ドロップ</p>
              <p className="text-xs text-gray-400 mt-1">
                またはクリックしてファイルを選択
              </p>
            </>
          )}
          <input
            id="photo-file-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            data-testid="photo-file-input"
          />
        </div>
      </Card>

      {/* Photo list */}
      {selectedEvent && selectedEvent.photos.length > 0 && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">登録済み写真 ({selectedEvent.photos.length}枚)</h3>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
            {selectedEvent.photos.map((p) => (
              <div key={p.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumbnailUrl}
                  alt={p.id}
                  className="w-full aspect-[4/3] object-cover rounded-lg"
                />
                <button
                  onClick={() => removePhoto(p.id)}
                  className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ===== Companies =====
function CompaniesTab({ onSave }: { onSave: (msg: string) => void }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", tier: "gold" as CompanyTier, tags: "" as string,
    cm15: "", cm30: "", cm60: "",
    offerText: "", offerUrl: "", couponCode: "",
  });

  useEffect(() => { setCompanies(getStoredCompanies()); }, []);

  const TIER_COLORS: Record<string, string> = {
    platinum: "bg-blue-100 text-blue-700",
    gold: "bg-yellow-100 text-yellow-700",
    silver: "bg-gray-100 text-gray-600",
    bronze: "bg-orange-100 text-orange-700",
  };

  const startNew = () => {
    setEditing("__new__");
    setForm({ name: "", tier: "gold", tags: "", cm15: "", cm30: "", cm60: "", offerText: "", offerUrl: "", couponCode: "" });
  };

  const startEdit = (c: Company) => {
    setEditing(c.id);
    setForm({
      name: c.name, tier: c.tier, tags: c.tags.join(", "),
      cm15: c.videos.cm15, cm30: c.videos.cm30, cm60: c.videos.cm60,
      offerText: c.offerText, offerUrl: c.offerUrl, couponCode: c.couponCode || "",
    });
  };

  const save = () => {
    if (!form.name) return;
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean) as InterestTag[];
    let updated: Company[];
    if (editing === "__new__") {
      const newCo: Company = {
        id: `co-${Date.now()}`,
        name: form.name,
        logoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name.slice(0, 2))}&background=6EC6FF&color=fff&size=80&rounded=true`,
        tier: form.tier,
        tags,
        videos: { cm15: form.cm15, cm30: form.cm30, cm60: form.cm60 },
        offerText: form.offerText,
        offerUrl: form.offerUrl,
        couponCode: form.couponCode || undefined,
      };
      updated = [...companies, newCo];
    } else {
      updated = companies.map((c) =>
        c.id === editing
          ? {
              ...c, name: form.name, tier: form.tier, tags,
              videos: { cm15: form.cm15, cm30: form.cm30, cm60: form.cm60 },
              offerText: form.offerText, offerUrl: form.offerUrl,
              couponCode: form.couponCode || undefined,
            }
          : c
      );
    }
    setStoredCompanies(updated);
    setCompanies(updated);
    setEditing(null);
    onSave("企業情報を保存しました");
  };

  const remove = (id: string) => {
    const updated = companies.filter((c) => c.id !== id);
    setStoredCompanies(updated);
    setCompanies(updated);
    onSave("企業を削除しました");
  };

  return (
    <div className="space-y-4" data-testid="admin-companies">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">パートナー企業</h2>
        <Button size="sm" onClick={startNew}>+ 企業追加</Button>
      </div>

      {editing && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">{editing === "__new__" ? "新規企業" : "企業編集"}</h3>
          <div className="space-y-3">
            <input className={inputCls} placeholder="企業名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="company-name-input" />
            <select className={inputCls} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as CompanyTier })} data-testid="company-tier-select">
              <option value="platinum">Platinum</option>
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="bronze">Bronze</option>
            </select>
            <input className={inputCls} placeholder="タグ（カンマ区切り: education, sports）" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} data-testid="company-tags-input" />
            <div className="border border-gray-100 rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-gray-500">CM動画 YouTube ID</p>
              <input className={inputCls + " font-mono"} placeholder="15秒CM（例: dQw4w9WgXcQ）" value={form.cm15} onChange={(e) => setForm({ ...form, cm15: e.target.value })} data-testid="company-cm15-input" />
              <input className={inputCls + " font-mono"} placeholder="30秒CM" value={form.cm30} onChange={(e) => setForm({ ...form, cm30: e.target.value })} data-testid="company-cm30-input" />
              <input className={inputCls + " font-mono"} placeholder="60秒CM" value={form.cm60} onChange={(e) => setForm({ ...form, cm60: e.target.value })} data-testid="company-cm60-input" />
            </div>
            <input className={inputCls} placeholder="オファーテキスト" value={form.offerText} onChange={(e) => setForm({ ...form, offerText: e.target.value })} />
            <input className={inputCls} placeholder="オファーURL" value={form.offerUrl} onChange={(e) => setForm({ ...form, offerUrl: e.target.value })} />
            <input className={inputCls + " font-mono"} placeholder="クーポンコード（任意）" value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value })} />
            <div className="flex gap-2">
              <Button size="sm" onClick={save}>保存</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>キャンセル</Button>
            </div>
          </div>
        </Card>
      )}

      {companies.map((c) => (
        <Card key={c.id}>
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.logoUrl} alt={c.name} className="w-12 h-12 rounded-full" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-gray-700">{c.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${TIER_COLORS[c.tier]}`}>
                  {c.tier}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                タグ: {c.tags.join(", ")}
              </p>
              <div className="flex gap-2 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.videos.cm15 ? "bg-green-50 border border-green-200 text-green-600" : "bg-gray-50 border border-gray-200 text-gray-400"}`}>
                  CM15s {c.videos.cm15 ? "✓" : "✗"}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.videos.cm30 ? "bg-green-50 border border-green-200 text-green-600" : "bg-gray-50 border border-gray-200 text-gray-400"}`}>
                  CM30s {c.videos.cm30 ? "✓" : "✗"}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.videos.cm60 ? "bg-green-50 border border-green-200 text-green-600" : "bg-gray-50 border border-gray-200 text-gray-400"}`}>
                  CM60s {c.videos.cm60 ? "✓" : "✗"}
                </span>
              </div>
              {c.videos.cm15 && (
                <p className="text-[10px] text-gray-400 mt-1 font-mono">
                  ID: {c.videos.cm15}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(c)} className="text-xs text-[#6EC6FF] hover:underline">編集</button>
              <button onClick={() => remove(c.id)} className="text-xs text-red-400 hover:underline">削除</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ===== Survey =====
function SurveyTab({ onSave }: { onSave: (msg: string) => void }) {
  const [survey, setSurvey] = useState<SurveyQuestion[]>([]);

  useEffect(() => { setSurvey(getStoredSurvey()); }, []);

  const updateQuestion = (id: string, question: string) => {
    const updated = survey.map((q) => (q.id === id ? { ...q, question } : q));
    setSurvey(updated);
    setStoredSurvey(updated);
  };

  const updateMaxSelections = (id: string, max: number) => {
    const updated = survey.map((q) => (q.id === id ? { ...q, maxSelections: max } : q));
    setSurvey(updated);
    setStoredSurvey(updated);
  };

  const addOption = (qId: string, label: string, tag: string) => {
    if (!label || !tag) return;
    const updated = survey.map((q) =>
      q.id === qId
        ? { ...q, options: [...q.options, { label, tag: tag as InterestTag }] }
        : q
    );
    setSurvey(updated);
    setStoredSurvey(updated);
    onSave("選択肢を追加しました");
  };

  const removeOption = (qId: string, tag: string) => {
    const updated = survey.map((q) =>
      q.id === qId
        ? { ...q, options: q.options.filter((o) => o.tag !== tag) }
        : q
    );
    setSurvey(updated);
    setStoredSurvey(updated);
  };

  const addQuestion = () => {
    const newQ: SurveyQuestion = {
      id: `q-${Date.now()}`,
      question: "新しい質問",
      maxSelections: 3,
      options: [],
    };
    const updated = [...survey, newQ];
    setSurvey(updated);
    setStoredSurvey(updated);
    onSave("質問を追加しました");
  };

  const removeQuestion = (id: string) => {
    const updated = survey.filter((q) => q.id !== id);
    setSurvey(updated);
    setStoredSurvey(updated);
    onSave("質問を削除しました");
  };

  const saveSurvey = () => {
    setStoredSurvey(survey);
    onSave("アンケートを保存しました");
  };

  return (
    <div className="space-y-4" data-testid="admin-survey">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">アンケート設定</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={addQuestion}>+ 質問追加</Button>
          <Button size="sm" onClick={saveSurvey}>保存</Button>
        </div>
      </div>
      {survey.map((q, i) => (
        <SurveyQuestionEditor
          key={q.id}
          index={i}
          question={q}
          onUpdateQuestion={(text) => updateQuestion(q.id, text)}
          onUpdateMax={(max) => updateMaxSelections(q.id, max)}
          onAddOption={(label, tag) => addOption(q.id, label, tag)}
          onRemoveOption={(tag) => removeOption(q.id, tag)}
          onRemove={() => removeQuestion(q.id)}
        />
      ))}
    </div>
  );
}

function SurveyQuestionEditor({
  index, question, onUpdateQuestion, onUpdateMax, onAddOption, onRemoveOption, onRemove,
}: {
  index: number;
  question: SurveyQuestion;
  onUpdateQuestion: (text: string) => void;
  onUpdateMax: (max: number) => void;
  onAddOption: (label: string, tag: string) => void;
  onRemoveOption: (tag: string) => void;
  onRemove: () => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newTag, setNewTag] = useState("");

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs bg-[#6EC6FF] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0">
          {index + 1}
        </span>
        <input
          type="text"
          value={question.question}
          onChange={(e) => onUpdateQuestion(e.target.value)}
          className={inputCls + " font-medium"}
          data-testid={`survey-q-${question.id}`}
        />
        <button onClick={onRemove} className="text-xs text-red-400 hover:underline flex-shrink-0">削除</button>
      </div>

      <div className="ml-8 space-y-2">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>最大選択数:</span>
          <input
            type="number"
            min={1}
            max={10}
            value={question.maxSelections}
            onChange={(e) => onUpdateMax(Number(e.target.value))}
            className="w-16 px-2 py-1 rounded-lg border border-gray-200 text-center text-xs"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => (
            <span
              key={opt.tag}
              className="text-xs bg-gray-50 border border-gray-200 px-3 py-1 rounded-full text-gray-600 flex items-center gap-1"
            >
              {opt.label}
              <span className="text-[10px] text-gray-400">({opt.tag})</span>
              <button
                onClick={() => onRemoveOption(opt.tag)}
                className="text-red-400 hover:text-red-600 ml-1"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <input
            className="flex-1 px-2 py-1 rounded-lg border border-gray-200 text-xs"
            placeholder="ラベル"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <input
            className="flex-1 px-2 py-1 rounded-lg border border-gray-200 text-xs font-mono"
            placeholder="タグ (例: education)"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
          />
          <button
            onClick={() => { onAddOption(newLabel, newTag); setNewLabel(""); setNewTag(""); }}
            className="text-xs text-[#6EC6FF] hover:underline flex-shrink-0"
          >
            + 追加
          </button>
        </div>
      </div>
    </Card>
  );
}

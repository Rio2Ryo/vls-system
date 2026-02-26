"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ADMIN_PASSWORD } from "@/lib/data";
import { AnalyticsRecord, CMMatchResult, Company, CompanyTier, EventData, InterestTag, PhotoData, SurveyQuestion, VideoPlayRecord } from "@/lib/types";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredEvents, setStoredEvents,
  getStoredCompanies, setStoredCompanies,
  getStoredSurvey, setStoredSurvey,
  getStoredAnalytics, clearAnalytics,
  getStoredVideoPlays,
  getStoredTenants,
  getStoredNotificationLog,
  resetToDefaults,
  getEventsForTenant,
  getAnalyticsForTenant,
  getVideoPlaysForTenant,
} from "@/lib/store";
import { NotificationLog } from "@/lib/types";
import { getCMMatch } from "@/lib/matching";
import { IS_DEMO_MODE } from "@/lib/demo";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import TenantManager from "@/components/admin/TenantManager";
import BulkImport from "@/components/admin/BulkImport";
import InvoiceGenerator from "@/components/admin/InvoiceGenerator";
import ChartJsAnalytics from "@/components/admin/ChartJsAnalytics";
import LicenseBulkImport from "@/components/admin/LicenseBulkImport";
// checkLicenseExpiry is used in TenantManager component

type Tab = "events" | "photos" | "companies" | "survey" | "dashboard" | "storage" | "matching" | "funnel" | "tenants" | "import" | "invoices" | "chartjs" | "licenses" | "notifications";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState("");
  const [activeEventId, setActiveEventId] = useState<string>("");
  const [adminEvents, setAdminEvents] = useState<EventData[]>([]);
  const [adminTenantId, setAdminTenantId] = useState<string | null>(null);
  const [adminTenantName, setAdminTenantName] = useState<string>("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }, []);

  // Load events for the event context selector (filtered by tenant)
  useEffect(() => {
    if (!authed) return;
    const allEvts = getStoredEvents();
    const evts = adminTenantId ? allEvts.filter((e) => e.tenantId === adminTenantId) : allEvts;
    setAdminEvents(evts);
    if (evts.length > 0 && !activeEventId) setActiveEventId(evts[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, adminTenantId]);

  const refreshEvents = useCallback(() => {
    const allEvts = getStoredEvents();
    const evts = adminTenantId ? allEvts.filter((e) => e.tenantId === adminTenantId) : allEvts;
    setAdminEvents(evts);
    if (!evts.find((e) => e.id === activeEventId) && evts.length > 0) {
      setActiveEventId(evts[0].id);
    }
  }, [activeEventId, adminTenantId]);

  const activeEvent = adminEvents.find((e) => e.id === activeEventId);

  // Check sessionStorage for existing auth on mount
  useEffect(() => {
    if (sessionStorage.getItem("adminAuthed") === "true") {
      setAuthed(true);
      const tid = sessionStorage.getItem("adminTenantId");
      if (tid) {
        setAdminTenantId(tid);
        const t = getStoredTenants().find((t) => t.id === tid);
        if (t) setAdminTenantName(t.name);
      }
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      setAuthed(true);
      setAdminTenantId(null);
      setAdminTenantName("");
      sessionStorage.setItem("adminAuthed", "true");
      sessionStorage.removeItem("adminTenantId");
    } else {
      // Check tenant passwords
      const tenants = getStoredTenants();
      const tenant = tenants.find((t) => t.adminPassword === pw.toUpperCase());
      if (tenant) {
        if (tenant.isActive === false) {
          setPwError("このテナントは無効化されています");
        } else if (tenant.licenseEnd && new Date(tenant.licenseEnd + "T23:59:59") < new Date()) {
          setPwError("ライセンスが期限切れです。管理者にお問い合わせください");
        } else {
          setAuthed(true);
          setAdminTenantId(tenant.id);
          setAdminTenantName(tenant.name);
          sessionStorage.setItem("adminAuthed", "true");
          sessionStorage.setItem("adminTenantId", tenant.id);
        }
      } else {
        setPwError("パスワードが違います");
      }
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

  const ALL_TABS: { key: Tab; label: string; icon: string; demoHidden?: boolean; superOnly?: boolean }[] = [
    { key: "dashboard", label: "ダッシュボード", icon: "📊" },
    { key: "events", label: "イベント管理", icon: "🎪" },
    { key: "photos", label: "写真管理", icon: "📷" },
    { key: "companies", label: "企業管理", icon: "🏢" },
    { key: "survey", label: "アンケート", icon: "📝" },
    { key: "import", label: "参加者管理", icon: "👥" },
    { key: "invoices", label: "請求書", icon: "🧾" },
    { key: "funnel", label: "完了率分析", icon: "📉" },
    { key: "chartjs", label: "Chart.js分析", icon: "📈" },
    { key: "licenses", label: "ライセンス管理", icon: "🔑", superOnly: true },
    { key: "tenants", label: "テナント管理", icon: "🏫", superOnly: true },
    { key: "notifications", label: "通知ログ", icon: "🔔", superOnly: true },
    { key: "storage", label: "R2ストレージ", icon: "☁️", demoHidden: true, superOnly: true },
    { key: "matching", label: "マッチングテスト", icon: "🎯", demoHidden: true },
  ];
  const TABS = ALL_TABS.filter((t) => {
    if (IS_DEMO_MODE && t.demoHidden) return false;
    if (adminTenantId && t.superOnly) return false;
    return true;
  });

  return (
    <main className="min-h-screen bg-gray-50">
      <AdminHeader
        title={IS_DEMO_MODE ? "VLS Admin (Demo)" : adminTenantName ? `VLS Admin — ${adminTenantName}` : "VLS Admin"}
        onLogout={() => { setAuthed(false); setAdminTenantId(null); setAdminTenantName(""); sessionStorage.removeItem("adminAuthed"); sessionStorage.removeItem("adminTenantId"); }}
        actions={
          IS_DEMO_MODE ? undefined : (
            <button
              onClick={() => { resetToDefaults(); showToast("デフォルトに戻しました"); refreshEvents(); }}
              className="text-xs text-gray-400 hover:text-red-500"
              data-testid="admin-reset"
            >
              リセット
            </button>
          )
        }
      />

      {/* Active event context bar */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-blue-100 px-6 py-2">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <span className="text-xs text-gray-500 font-medium flex-shrink-0">操作対象:</span>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {adminEvents.map((evt) => (
              <button
                key={evt.id}
                onClick={() => setActiveEventId(evt.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                  activeEventId === evt.id
                    ? "bg-[#6EC6FF] text-white shadow-sm"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                }`}
                data-testid={`ctx-event-${evt.id}`}
              >
                {evt.name}
                <span className="ml-1 opacity-60">({evt.photos.length}枚)</span>
              </button>
            ))}
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
            {tab === "dashboard" && <DashboardTab tenantId={adminTenantId} />}
            {tab === "events" && <EventsTab onSave={(msg) => { showToast(msg); refreshEvents(); }} tenantId={adminTenantId} />}
            {tab === "photos" && <PhotosTab onSave={(msg) => { showToast(msg); refreshEvents(); }} activeEventId={activeEventId} tenantId={adminTenantId} />}
            {tab === "companies" && <CompaniesTab onSave={showToast} />}
            {tab === "survey" && <SurveyTab onSave={showToast} activeEventId={activeEventId} activeEvent={activeEvent} tenantId={adminTenantId} />}
            {tab === "import" && <BulkImport onSave={showToast} tenantId={adminTenantId} />}
            {tab === "invoices" && <InvoiceGenerator onSave={showToast} tenantId={adminTenantId} />}
            {tab === "funnel" && <FunnelAnalysisTab tenantId={adminTenantId} />}
            {tab === "chartjs" && <ChartJsAnalytics tenantId={adminTenantId} />}
            {tab === "licenses" && <LicenseBulkImport onSave={showToast} />}
            {tab === "tenants" && <TenantManager onSave={showToast} />}
            {tab === "notifications" && <NotificationLogTab />}
            {tab === "storage" && <StorageTab onSave={showToast} />}
            {tab === "matching" && <MatchingDebugTab />}
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

// ===== Event Stats CSV Export =====
function exportEventStatsCsv(
  events: EventData[],
  analytics: AnalyticsRecord[],
  videoPlays: VideoPlayRecord[],
  companies: Company[]
) {
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  // Header
  const headerCols = [
    "イベント名",
    "開催日",
    "会場",
    "アクセス数",
    "アンケート完了",
    "アンケート完了率",
    "CM視聴完了",
    "CM視聴完了率",
    "写真閲覧数",
    "写真閲覧率",
    "DL完了数",
    "DL完了率",
    "CM再生回数（合計）",
    "CM完了回数（合計）",
    "CM完了率（合計）",
    "CM平均視聴秒数",
    "CM15s再生",
    "CM15s完了率",
    "CM30s再生",
    "CM30s完了率",
    "CM60s再生",
    "CM60s完了率",
    "企業別CM再生詳細",
  ];
  const rows: string[] = [headerCols.map(escapeCsvField).join(",")];

  for (const evt of events) {
    const evtAnalytics = analytics.filter((r) => r.eventId === evt.id);
    const evtPlays = videoPlays.filter((p) => p.eventId === evt.id);

    const access = evtAnalytics.filter((r) => r.stepsCompleted.access).length;
    const surveyed = evtAnalytics.filter((r) => r.stepsCompleted.survey).length;
    const cmViewed = evtAnalytics.filter((r) => r.stepsCompleted.cmViewed).length;
    const photosViewed = evtAnalytics.filter((r) => r.stepsCompleted.photosViewed).length;
    const downloaded = evtAnalytics.filter((r) => r.stepsCompleted.downloaded).length;

    const pct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : "—";

    // CM play stats
    const totalCmPlays = evtPlays.length;
    const totalCmCompleted = evtPlays.filter((p) => p.completed).length;
    const avgWatch = totalCmPlays > 0
      ? Math.round(evtPlays.reduce((s, p) => s + p.watchedSeconds, 0) / totalCmPlays)
      : 0;

    // By CM type
    const cmByType = (type: "cm15" | "cm30" | "cm60") => {
      const typed = evtPlays.filter((p) => p.cmType === type);
      const comp = typed.filter((p) => p.completed).length;
      return { plays: typed.length, rate: pct(comp, typed.length) };
    };
    const cm15 = cmByType("cm15");
    const cm30 = cmByType("cm30");
    const cm60 = cmByType("cm60");

    // Per-company breakdown
    const companyBreakdown: string[] = [];
    const companyPlayMap = new Map<string, { plays: number; completed: number }>();
    for (const p of evtPlays) {
      if (!companyPlayMap.has(p.companyId)) {
        companyPlayMap.set(p.companyId, { plays: 0, completed: 0 });
      }
      const entry = companyPlayMap.get(p.companyId)!;
      entry.plays++;
      if (p.completed) entry.completed++;
    }
    Array.from(companyPlayMap.entries()).forEach(([cId, stat]) => {
      const name = companyMap.get(cId) || cId;
      companyBreakdown.push(`${name}:${stat.plays}回(完了${pct(stat.completed, stat.plays)})`);
    });

    const row = [
      evt.name,
      evt.date,
      evt.venue || "",
      String(access),
      String(surveyed),
      pct(surveyed, access),
      String(cmViewed),
      pct(cmViewed, access),
      String(photosViewed),
      pct(photosViewed, access),
      String(downloaded),
      pct(downloaded, access),
      String(totalCmPlays),
      String(totalCmCompleted),
      pct(totalCmCompleted, totalCmPlays),
      `${avgWatch}秒`,
      String(cm15.plays),
      cm15.rate,
      String(cm30.plays),
      cm30.rate,
      String(cm60.plays),
      cm60.rate,
      companyBreakdown.join(" / "),
    ];
    rows.push(row.map(escapeCsvField).join(","));
  }

  const bom = "\uFEFF";
  const csvContent = bom + rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `イベント統計_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== Dashboard =====
function DashboardTab({ tenantId }: { tenantId?: string | null }) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [videoPlays, setVideoPlays] = useState<VideoPlayRecord[]>([]);
  const [selectedEventFilter, setSelectedEventFilter] = useState<string>("all");

  useEffect(() => {
    setEvents(tenantId ? getEventsForTenant(tenantId) : getStoredEvents());
    setCompanies(getStoredCompanies());
    setAnalytics(tenantId ? getAnalyticsForTenant(tenantId) : getStoredAnalytics());
    setVideoPlays(tenantId ? getVideoPlaysForTenant(tenantId) : getStoredVideoPlays());
  }, [tenantId]);

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
    const evtPlays = videoPlays.filter((p) => p.eventId === evt.id);
    const accessCount = evtRecords.filter((r) => r.stepsCompleted.access).length;
    const dlCount = evtRecords.filter((r) => r.stepsCompleted.downloaded).length;
    const cmPlayCount = evtPlays.length;
    const cmCompletedCount = evtPlays.filter((p) => p.completed).length;
    return {
      event: evt,
      access: accessCount,
      completed: dlCount,
      completionRate: accessCount > 0
        ? Math.round((dlCount / accessCount) * 100)
        : 0,
      cmPlays: cmPlayCount,
      cmCompleted: cmCompletedCount,
      cmCompletionRate: cmPlayCount > 0
        ? Math.round((cmCompletedCount / cmPlayCount) * 100)
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

      {/* Stats CSV Export */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-700">統計CSVエクスポート</h3>
            <p className="text-xs text-gray-400 mt-0.5">イベント別のDL数・CM視聴完了率を含む統計データ</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportEventStatsCsv(events, analytics, videoPlays, companies)}
              className="text-xs px-4 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium transition-colors"
              data-testid="stats-csv-export-btn"
            >
              イベント統計CSV
            </button>
            {analytics.filter((r) => r.surveyAnswers).length > 0 && (
              <button
                onClick={() => exportSurveyCsv(analytics.filter((r) => r.surveyAnswers), getStoredSurvey(), events)}
                className="text-xs px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 font-medium transition-colors"
                data-testid="survey-csv-export-btn"
              >
                アンケート回答CSV
              </button>
            )}
          </div>
        </div>
      </Card>

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
            {!IS_DEMO_MODE && !tenantId && (
              <button
                onClick={handleClearAnalytics}
                className="text-[10px] text-red-400 hover:text-red-600"
              >
                データクリア
              </button>
            )}
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
                  <th className="text-center py-2 text-gray-500 font-medium">アクセス</th>
                  <th className="text-center py-2 text-gray-500 font-medium">DL完了</th>
                  <th className="text-center py-2 text-gray-500 font-medium">DL率</th>
                  <th className="text-center py-2 text-gray-500 font-medium">CM再生</th>
                  <th className="text-center py-2 text-gray-500 font-medium">CM完了率</th>
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
                    <td className="py-2 text-center font-mono">{es.cmPlays}</td>
                    <td className="py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        es.cmCompletionRate >= 70 ? "bg-green-50 text-green-600" :
                        es.cmCompletionRate >= 40 ? "bg-yellow-50 text-yellow-600" :
                        "bg-gray-50 text-gray-500"
                      }`}>
                        {es.cmPlays > 0 ? `${es.cmCompletionRate}%` : "—"}
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

      {/* CM view stats — grouped by tier */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-700">CM表示回数（企業別）</h3>
          <div className="flex gap-2 text-[10px]">
            {(["platinum", "gold", "silver", "bronze"] as const).map((t) => {
              const count = companies.filter((c) => c.tier === t).length;
              const tierColors: Record<string, string> = { platinum: "bg-blue-100 text-blue-700", gold: "bg-yellow-100 text-yellow-700", silver: "bg-gray-100 text-gray-600", bronze: "bg-orange-100 text-orange-700" };
              return <span key={t} className={`px-2 py-0.5 rounded-full font-bold uppercase ${tierColors[t]}`}>{t} ({count})</span>;
            })}
          </div>
        </div>
        {companies.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">企業が登録されていません</p>
        ) : (
          <div className="space-y-4">
            {(["platinum", "gold", "silver", "bronze"] as CompanyTier[]).map((tier) => {
              const tierCompanies = companies
                .filter((c) => c.tier === tier)
                .sort((a, b) => {
                  const aTotal = (cmViewCounts[a.id]?.matched || 0) + (cmViewCounts[a.id]?.platinum || 0);
                  const bTotal = (cmViewCounts[b.id]?.matched || 0) + (cmViewCounts[b.id]?.platinum || 0);
                  return bTotal - aTotal;
                });
              if (tierCompanies.length === 0) return null;
              const tierLabels: Record<string, string> = { platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze" };
              const tierBg: Record<string, string> = { platinum: "border-l-blue-400", gold: "border-l-yellow-400", silver: "border-l-gray-400", bronze: "border-l-orange-400" };
              return (
                <div key={tier} className={`border-l-4 ${tierBg[tier]} pl-3`}>
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">{tierLabels[tier]} ({tierCompanies.length}社)</p>
                  <div className="space-y-2">
                    {tierCompanies.map((c) => {
                      const views = cmViewCounts[c.id] || { matched: 0, platinum: 0 };
                      const total = views.matched + views.platinum;
                      return (
                        <div key={c.id} className="flex items-center gap-3" data-testid={`cm-stats-${c.id}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.logoUrl} alt={c.name} className="w-8 h-8 rounded-full flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-600 truncate block">{c.name}</span>
                            <div className="flex gap-3 text-xs">
                              <span className="text-blue-500">提供CM: <b>{views.platinum}</b></span>
                              <span className="text-green-500">マッチCM: <b>{views.matched}</b></span>
                              <span className="text-gray-400">計: <b>{total}</b></span>
                            </div>
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
    </div>
  );
}

// ===== Events =====
type EventSortKey = "default" | "date-desc" | "date-asc" | "name-asc" | "name-desc" | "photos-desc";

function EventsTab({ onSave, tenantId }: { onSave: (msg: string) => void; tenantId?: string | null }) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", date: "", venue: "", description: "", password: "", companyIds: [] as string[], slug: "", notifyEmail: "" });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrEventId, setQrEventId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Sort & filter state
  const [sortKey, setSortKey] = useState<EventSortKey>("default");
  const [filterText, setFilterText] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const getShareUrl = (pw: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/?pw=${encodeURIComponent(pw)}`;
  };

  const getEventUrl = (evt: EventData) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return evt.slug ? `${base}/e/${evt.slug}` : getShareUrl(evt.password);
  };

  const copyUrl = (evt: EventData) => {
    navigator.clipboard.writeText(getEventUrl(evt));
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
    const url = getEventUrl(evt);
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
    setEvents(tenantId ? getEventsForTenant(tenantId) : getStoredEvents());
    setCompanies(getStoredCompanies());
  }, [tenantId]);

  // maxEvents enforcement for tenant
  const tenantInfo = tenantId ? getStoredTenants().find((t) => t.id === tenantId) : null;
  const maxEventsReached = tenantInfo?.maxEvents ? events.length >= tenantInfo.maxEvents : false;

  const startNew = () => {
    if (maxEventsReached) return;
    setEditing("__new__");
    setForm({ name: "", date: "", venue: "", description: "", password: "", companyIds: [], slug: "", notifyEmail: "" });
  };

  const startEdit = (evt: EventData) => {
    setEditing(evt.id);
    setForm({ name: evt.name, date: evt.date, venue: evt.venue || "", description: evt.description, password: evt.password, companyIds: evt.companyIds || [], slug: evt.slug || "", notifyEmail: evt.notifyEmail || "" });
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
    const slugVal = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || undefined;
    const emailVal = form.notifyEmail.trim() || undefined;
    const allEvents = getStoredEvents();
    let newEvt: EventData | null = null;
    let updatedAll: EventData[];
    if (editing === "__new__") {
      const tid = tenantId || undefined;
      newEvt = {
        id: `evt-${Date.now()}`,
        name: form.name,
        date: form.date,
        venue: form.venue || undefined,
        description: form.description,
        password: form.password.toUpperCase(),
        photos: [],
        companyIds: form.companyIds.length > 0 ? form.companyIds : undefined,
        slug: slugVal,
        notifyEmail: emailVal,
        tenantId: tid,
      };
      updatedAll = [...allEvents, newEvt];
    } else {
      updatedAll = allEvents.map((e) =>
        e.id === editing
          ? {
              ...e,
              name: form.name,
              date: form.date,
              venue: form.venue || undefined,
              description: form.description,
              password: form.password.toUpperCase(),
              companyIds: form.companyIds.length > 0 ? form.companyIds : undefined,
              slug: slugVal,
              notifyEmail: emailVal,
            }
          : e
      );
    }
    setStoredEvents(updatedAll);
    setEvents(tenantId ? updatedAll.filter((e) => e.tenantId === tenantId) : updatedAll);
    setEditing(null);
    onSave("イベントを保存しました");
  };

  const remove = (id: string) => {
    const allEvents = getStoredEvents();
    const updatedAll = allEvents.filter((e) => e.id !== id);
    setStoredEvents(updatedAll);
    setEvents(tenantId ? updatedAll.filter((e) => e.tenantId === tenantId) : updatedAll);
    onSave("イベントを削除しました");
  };

  const TIER_COLORS: Record<string, string> = {
    platinum: "bg-blue-100 text-blue-700",
    gold: "bg-yellow-100 text-yellow-700",
    silver: "bg-gray-100 text-gray-600",
    bronze: "bg-orange-100 text-orange-700",
  };

  // --- Sort & filter logic ---
  const filtered = events.filter((evt) => {
    if (filterText) {
      const q = filterText.toLowerCase();
      const match =
        evt.name.toLowerCase().includes(q) ||
        (evt.venue || "").toLowerCase().includes(q) ||
        evt.password.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filterDateFrom && evt.date < filterDateFrom) return false;
    if (filterDateTo && evt.date > filterDateTo) return false;
    return true;
  });

  const sorted = sortKey === "default"
    ? filtered
    : [...filtered].sort((a, b) => {
        switch (sortKey) {
          case "date-desc": return (b.date || "").localeCompare(a.date || "");
          case "date-asc": return (a.date || "").localeCompare(b.date || "");
          case "name-asc": return a.name.localeCompare(b.name, "ja");
          case "name-desc": return b.name.localeCompare(a.name, "ja");
          case "photos-desc": return b.photos.length - a.photos.length;
          default: return 0;
        }
      });

  const hasActiveFilters = !!(filterText || filterDateFrom || filterDateTo);

  const [pdfGenerating, setPdfGenerating] = useState(false);

  const generateBulkQrPdf = async () => {
    if (events.length === 0) return;
    setPdfGenerating(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = 210;
      const margin = 15;
      const cols = 2;
      const qrSize = 60;
      const cellW = (pageW - margin * 2) / cols;
      const cellH = 90;
      let idx = 0;

      for (const evt of events) {
        const url = getEventUrl(evt);
        const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 1 });

        const col = idx % cols;
        const row = Math.floor((idx % (cols * 3)) / cols);

        if (idx > 0 && idx % (cols * 3) === 0) {
          doc.addPage();
        }

        const x = margin + col * cellW;
        const y = margin + row * cellH;

        // QR code image
        doc.addImage(dataUrl, "PNG", x + (cellW - qrSize) / 2, y, qrSize, qrSize);

        // Event name (using built-in font, limited to ASCII-safe display)
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        const label = evt.name;
        doc.text(label, x + cellW / 2, y + qrSize + 5, { align: "center" });

        // URL below
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(url, x + cellW / 2, y + qrSize + 10, { align: "center" });

        // Password
        doc.setFontSize(8);
        doc.text(`PW: ${evt.password}`, x + cellW / 2, y + qrSize + 15, { align: "center" });

        idx++;
      }

      doc.save(`VLS_QR_codes_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
    }
    setPdfGenerating(false);
  };

  return (
    <div className="space-y-4" data-testid="admin-events">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">イベント一覧</h2>
        <div className="flex gap-2">
          <button
            onClick={generateBulkQrPdf}
            disabled={pdfGenerating || events.length === 0}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-500 text-white hover:bg-purple-600 font-medium disabled:opacity-50 transition-colors"
            data-testid="bulk-qr-pdf-btn"
          >
            {pdfGenerating ? "PDF生成中..." : `QR一括PDF (${events.length}件)`}
          </button>
          {!IS_DEMO_MODE && (
            <Button size="sm" onClick={startNew} disabled={maxEventsReached}>
              + 新規作成{maxEventsReached ? ` (上限${tenantInfo?.maxEvents}件)` : ""}
            </Button>
          )}
        </div>
      </div>

      {maxEventsReached && (
        <Card>
          <p className="text-xs text-yellow-600 text-center">
            イベント上限（{tenantInfo?.maxEvents}件）に達しています。プランのアップグレードをご検討ください。
          </p>
        </Card>
      )}

      {/* Sort & Filter bar */}
      <Card>
        <div className="space-y-3">
          {/* Search + Sort row */}
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <input
                className={inputCls + " pl-8"}
                placeholder="イベント名・会場・パスワードで検索"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                data-testid="event-filter-text"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                🔍
              </span>
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as EventSortKey)}
              className="px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-xs text-gray-600 bg-white"
              data-testid="event-sort-select"
            >
              <option value="default">登録順</option>
              <option value="date-desc">日付: 新しい順</option>
              <option value="date-asc">日付: 古い順</option>
              <option value="name-asc">名前: A→Z</option>
              <option value="name-desc">名前: Z→A</option>
              <option value="photos-desc">写真: 多い順</option>
            </select>
          </div>
          {/* Date range row */}
          <div className="flex gap-2 items-center">
            <span className="text-xs text-gray-500 flex-shrink-0">期間:</span>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-xs text-gray-600"
              data-testid="event-filter-date-from"
            />
            <span className="text-xs text-gray-400">〜</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-xs text-gray-600"
              data-testid="event-filter-date-to"
            />
            {hasActiveFilters && (
              <button
                onClick={() => { setFilterText(""); setFilterDateFrom(""); setFilterDateTo(""); }}
                className="text-[10px] text-red-400 hover:text-red-600 ml-auto"
              >
                フィルタ解除
              </button>
            )}
          </div>
          {/* Result count */}
          <p className="text-[10px] text-gray-400">
            {hasActiveFilters
              ? `${sorted.length}件 / ${events.length}件表示`
              : `${events.length}件のイベント`}
          </p>
        </div>
      </Card>

      {!IS_DEMO_MODE && editing && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">{editing === "__new__" ? "新規イベント" : "イベント編集"}</h3>
          <div className="space-y-3">
            <input className={inputCls} placeholder="イベント名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="event-name-input" />
            <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="event-date-input" />
            <input className={inputCls} placeholder="会場（例: 東京ビッグサイト）" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} data-testid="event-venue-input" />
            <input className={inputCls} placeholder="説明" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input className={inputCls + " font-mono uppercase"} placeholder="パスワード（例: SUMMER2026）" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="event-password-input" />
            <input className={inputCls + " font-mono"} placeholder="カスタムURL slug（例: summer2026 → /e/summer2026）" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} data-testid="event-slug-input" />
            <input className={inputCls} type="email" placeholder="通知メール（任意: admin@example.com）" value={form.notifyEmail} onChange={(e) => setForm({ ...form, notifyEmail: e.target.value })} data-testid="event-notify-email" />

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

      {sorted.length === 0 && hasActiveFilters && (
        <p className="text-sm text-gray-400 text-center py-8">条件に一致するイベントがありません</p>
      )}

      {sorted.map((evt) => (
        <Card key={evt.id}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold text-gray-700">{evt.name}</h3>
              <p className="text-sm text-gray-400">
                {evt.date}{evt.venue ? ` · ${evt.venue}` : ""}{evt.description ? ` · ${evt.description}` : ""}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                パスワード: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono" data-testid={`event-pw-${evt.id}`}>{evt.password}</code>
                {evt.slug && <span className="ml-2 text-blue-500">slug: /e/{evt.slug}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
                {evt.photos.length}枚
              </span>
              {!IS_DEMO_MODE && <button onClick={() => startEdit(evt)} className="text-xs text-[#6EC6FF] hover:underline">編集</button>}
              {!IS_DEMO_MODE && <button onClick={() => remove(evt.id)} className="text-xs text-red-400 hover:underline">削除</button>}
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
                {evt.slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/e/${evt.slug}` : getShareUrl(evt.password)}
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

/** Upload a file to R2 via /api/upload (single POST with FormData). */
async function uploadFileToR2(
  file: File | Blob,
  eventId: string,
  type: "photos" | "thumbs" | "videos",
  adminPassword: string,
  fileName?: string
): Promise<{ key: string; url: string } | null> {
  try {
    const fd = new FormData();
    const name = fileName || (file instanceof File ? file.name : "file.jpg");
    fd.append("file", file, name);
    fd.append("eventId", eventId);
    fd.append("type", type);

    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "x-admin-password": adminPassword },
      body: fd,
    });
    if (!res.ok) return null;
    const result = await res.json();
    return { key: result.key, url: result.url };
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

function PhotosTab({ onSave, activeEventId, tenantId }: { onSave: (msg: string) => void; activeEventId: string; tenantId?: string | null }) {
  const [events, setEvts] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    const evts = tenantId ? getEventsForTenant(tenantId) : getStoredEvents();
    setEvts(evts);
    // Use the global active event context
    if (activeEventId && evts.find((e) => e.id === activeEventId)) {
      setSelectedEventId(activeEventId);
    } else if (evts.length > 0) {
      setSelectedEventId(evts[0].id);
    }
  }, [activeEventId, tenantId]);

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
      {!IS_DEMO_MODE && (
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
      )}

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
                {!IS_DEMO_MODE && (
                  <button
                    onClick={() => removePhoto(p.id)}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    ×
                  </button>
                )}
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
        {!IS_DEMO_MODE && <Button size="sm" onClick={startNew}>+ 企業追加</Button>}
      </div>

      {!IS_DEMO_MODE && editing && (
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

      {/* Tier summary */}
      <div className="grid grid-cols-4 gap-2">
        {(["platinum", "gold", "silver", "bronze"] as const).map((t) => {
          const count = companies.filter((c) => c.tier === t).length;
          return (
            <div key={t} className={`text-center py-2 rounded-xl ${TIER_COLORS[t]} bg-opacity-50`}>
              <p className="text-lg font-bold">{count}</p>
              <p className="text-[10px] uppercase font-bold">{t}</p>
            </div>
          );
        })}
      </div>

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
            {!IS_DEMO_MODE && (
              <div className="flex gap-2">
                <button onClick={() => startEdit(c)} className="text-xs text-[#6EC6FF] hover:underline">編集</button>
                <button onClick={() => remove(c.id)} className="text-xs text-red-400 hover:underline">削除</button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ===== Survey =====
function SurveyTab({ onSave, activeEventId, activeEvent }: { onSave: (msg: string) => void; activeEventId: string; activeEvent?: EventData; tenantId?: string | null }) {
  const [survey, setSurvey] = useState<SurveyQuestion[]>([]);
  const [mode, setMode] = useState<"event" | "global">("event");

  const isEventCustom = activeEvent?.surveyQuestions && activeEvent.surveyQuestions.length > 0;

  useEffect(() => {
    if (mode === "event" && activeEventId) {
      const evts = getStoredEvents();
      const evt = evts.find((e) => e.id === activeEventId);
      if (evt?.surveyQuestions && evt.surveyQuestions.length > 0) {
        setSurvey(evt.surveyQuestions);
      } else {
        setSurvey(getStoredSurvey());
      }
    } else {
      setSurvey(getStoredSurvey());
    }
  }, [activeEventId, mode]);

  const persistSurvey = (updated: SurveyQuestion[]) => {
    if (mode === "event" && activeEventId) {
      // Save to event-specific survey
      const events = getStoredEvents();
      const updatedEvents = events.map((e) =>
        e.id === activeEventId ? { ...e, surveyQuestions: updated } : e
      );
      setStoredEvents(updatedEvents);
    } else {
      setStoredSurvey(updated);
    }
  };

  const updateQuestion = (id: string, question: string) => {
    const updated = survey.map((q) => (q.id === id ? { ...q, question } : q));
    setSurvey(updated);
    persistSurvey(updated);
  };

  const updateMaxSelections = (id: string, max: number) => {
    const updated = survey.map((q) => (q.id === id ? { ...q, maxSelections: max } : q));
    setSurvey(updated);
    persistSurvey(updated);
  };

  const addOption = (qId: string, label: string, tag: string) => {
    if (!label || !tag) return;
    const updated = survey.map((q) =>
      q.id === qId
        ? { ...q, options: [...q.options, { label, tag: tag as InterestTag }] }
        : q
    );
    setSurvey(updated);
    persistSurvey(updated);
    onSave("選択肢を追加しました");
  };

  const removeOption = (qId: string, tag: string) => {
    const updated = survey.map((q) =>
      q.id === qId
        ? { ...q, options: q.options.filter((o) => o.tag !== tag) }
        : q
    );
    setSurvey(updated);
    persistSurvey(updated);
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
    persistSurvey(updated);
    onSave("質問を追加しました");
  };

  const removeQuestion = (id: string) => {
    const updated = survey.filter((q) => q.id !== id);
    setSurvey(updated);
    persistSurvey(updated);
    onSave("質問を削除しました");
  };

  const saveSurvey = () => {
    persistSurvey(survey);
    onSave(mode === "event" ? `${activeEvent?.name || "イベント"}のアンケートを保存しました` : "グローバルアンケートを保存しました");
  };

  const resetToGlobal = () => {
    if (!activeEventId) return;
    const events = getStoredEvents();
    const updatedEvents = events.map((e) =>
      e.id === activeEventId ? { ...e, surveyQuestions: undefined } : e
    );
    setStoredEvents(updatedEvents);
    setSurvey(getStoredSurvey());
    onSave("グローバル設定に戻しました");
  };

  const copyFromGlobal = () => {
    const globalSurvey = getStoredSurvey();
    setSurvey(globalSurvey);
    persistSurvey(globalSurvey);
    onSave("グローバル設定をコピーしました");
  };

  return (
    <div className="space-y-4" data-testid="admin-survey">
      {/* Mode toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          <button
            onClick={() => setMode("event")}
            className={`text-xs px-4 py-2 font-medium transition-colors ${
              mode === "event" ? "bg-[#6EC6FF] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            イベント別
          </button>
          <button
            onClick={() => setMode("global")}
            className={`text-xs px-4 py-2 font-medium transition-colors ${
              mode === "global" ? "bg-[#6EC6FF] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            グローバル（デフォルト）
          </button>
        </div>
        {mode === "event" && activeEvent && (
          <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-medium">
            {activeEvent.name}
            {isEventCustom ? " (カスタム)" : " (グローバル使用中)"}
          </span>
        )}
      </div>

      {!IS_DEMO_MODE && mode === "event" && activeEvent && !isEventCustom && (
        <Card>
          <p className="text-sm text-gray-500 mb-2">
            このイベントはグローバルアンケートを使用しています。カスタマイズするにはコピーしてください。
          </p>
          <Button size="sm" onClick={copyFromGlobal}>グローバルからコピーしてカスタマイズ</Button>
        </Card>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">
          {mode === "event" ? "イベント別アンケート設定" : "グローバルアンケート設定"}
        </h2>
        {!IS_DEMO_MODE && (
          <div className="flex gap-2">
            {mode === "event" && isEventCustom && (
              <Button size="sm" variant="secondary" onClick={resetToGlobal}>グローバルに戻す</Button>
            )}
            <Button size="sm" variant="secondary" onClick={addQuestion}>+ 質問追加</Button>
            <Button size="sm" onClick={saveSurvey}>保存</Button>
          </div>
        )}
      </div>
      {survey.map((q, i) => (
        IS_DEMO_MODE ? (
          <Card key={q.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-[#6EC6FF] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                {i + 1}
              </span>
              <span className="text-sm font-medium text-gray-700">{q.question}</span>
            </div>
            <div className="ml-8">
              <p className="text-xs text-gray-400 mb-2">最大選択数: {q.maxSelections}</p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <span key={opt.tag} className="text-xs bg-gray-50 border border-gray-200 px-3 py-1 rounded-full text-gray-600">
                    {opt.label} <span className="text-[10px] text-gray-400">({opt.tag})</span>
                  </span>
                ))}
              </div>
            </div>
          </Card>
        ) : (
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
        )
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

// ===== R2 Storage Browser =====
interface R2FileItem {
  key: string;
  size: number;
  lastModified: string;
  contentType?: string;
}

interface LifecycleRunResult {
  timestamp: string;
  scanned: number;
  compressed: number;
  deleted: number;
  errors: number;
  skipped: number;
  details: string[];
}

interface LifecycleData {
  lastRun: LifecycleRunResult | null;
  history: LifecycleRunResult[];
  stats: {
    totalSize: number;
    totalCount: number;
    activeSize: number;
    activeCount: number;
    longTermSize: number;
    longTermCount: number;
    byPrefix: Record<string, { count: number; size: number }>;
    ageDistribution: { recent: number; month: number; quarter: number; year: number; old: number };
  };
  config: { compressAfterDays: number; deleteAfterDays: number; cronSchedule: string };
}

function StorageTab({ onSave }: { onSave: (msg: string) => void }) {
  const [files, setFiles] = useState<R2FileItem[]>([]);
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [currentPrefix, setCurrentPrefix] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<"photos" | "videos">("photos");
  const [uploadEventId, setUploadEventId] = useState("");
  const [lifecycle, setLifecycle] = useState<LifecycleData | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [events, setEvents] = useState<EventData[]>([]);

  const loadFiles = useCallback(async (prefix?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (prefix) params.set("prefix", prefix);
      const res = await fetch(`/api/files?${params}`, {
        headers: { "x-admin-password": ADMIN_PASSWORD },
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setFiles(data.objects || []);
      setPrefixes(data.prefixes || []);
    } catch {
      setFiles([]);
      setPrefixes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLifecycle = useCallback(async () => {
    setLifecycleLoading(true);
    try {
      const res = await fetch("/api/lifecycle", {
        headers: { "x-admin-password": ADMIN_PASSWORD },
      });
      if (res.ok) {
        setLifecycle(await res.json());
      }
    } catch { /* ignore */ }
    finally { setLifecycleLoading(false); }
  }, []);

  useEffect(() => {
    loadFiles(currentPrefix || undefined);
    setEvents(getStoredEvents());
    loadLifecycle();
  }, [currentPrefix, loadFiles, loadLifecycle]);

  const navigateTo = (prefix: string) => {
    setCurrentPrefix(prefix);
  };

  const navigateUp = () => {
    const parts = currentPrefix.replace(/\/$/, "").split("/");
    parts.pop();
    setCurrentPrefix(parts.length > 0 ? parts.join("/") + "/" : "");
  };

  const handleUpload = async (fileList: FileList) => {
    setUploading(true);
    let uploaded = 0;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const result = await uploadFileToR2(
        file,
        uploadEventId || "general",
        uploadType,
        ADMIN_PASSWORD,
        file.name
      );
      if (result) uploaded++;
    }
    setUploading(false);
    if (uploaded > 0) {
      onSave(`${uploaded}ファイルをR2にアップロードしました`);
      loadFiles(currentPrefix || undefined);
    }
  };

  const handleDelete = async (key: string) => {
    try {
      const res = await fetch("/api/files", {
        method: "DELETE",
        headers: {
          "x-admin-password": ADMIN_PASSWORD,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        onSave("ファイルを削除しました");
        loadFiles(currentPrefix || undefined);
      }
    } catch { /* ignore */ }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const getFileIcon = (key: string, contentType?: string) => {
    if (contentType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(key)) return "🖼️";
    if (contentType?.startsWith("video/") || /\.(mp4|mov|avi|webm)$/i.test(key)) return "🎬";
    return "📄";
  };

  return (
    <div className="space-y-4" data-testid="admin-storage">
      <h2 className="text-lg font-bold text-gray-800">R2 ストレージ (vls-media)</h2>

      {/* Upload form */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-3">ファイルアップロード</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">タイプ</label>
              <select
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value as "photos" | "videos")}
                className={inputCls}
                data-testid="storage-upload-type"
              >
                <option value="photos">写真 (photos/)</option>
                <option value="videos">動画 (videos/)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">イベント</label>
              <select
                value={uploadEventId}
                onChange={(e) => setUploadEventId(e.target.value)}
                className={inputCls}
                data-testid="storage-upload-event"
              >
                <option value="">一般 (general)</option>
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>{evt.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              uploading ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:border-[#6EC6FF]"
            }`}
            onClick={() => !uploading && document.getElementById("r2-file-input")?.click()}
          >
            {uploading ? (
              <p className="text-sm text-blue-600 animate-pulse">アップロード中...</p>
            ) : (
              <>
                <p className="text-sm text-gray-600">クリックしてファイルを選択</p>
                <p className="text-xs text-gray-400 mt-1">写真・動画ファイル対応</p>
              </>
            )}
            <input
              id="r2-file-input"
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              data-testid="storage-file-input"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleUpload(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </div>
        </div>
      </Card>

      {/* File browser */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-700">ファイル一覧</h3>
            {loading && <span className="text-xs text-gray-400 animate-pulse">読み込み中...</span>}
          </div>
          <button
            onClick={() => loadFiles(currentPrefix || undefined)}
            className="text-xs text-[#6EC6FF] hover:underline"
          >
            更新
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 mb-3 text-xs">
          <button
            onClick={() => setCurrentPrefix("")}
            className={`px-2 py-1 rounded ${!currentPrefix ? "bg-[#6EC6FF] text-white" : "text-[#6EC6FF] hover:underline"}`}
          >
            vls-media
          </button>
          {currentPrefix && currentPrefix.split("/").filter(Boolean).map((part, i, arr) => {
            const path = arr.slice(0, i + 1).join("/") + "/";
            return (
              <span key={path} className="flex items-center gap-1">
                <span className="text-gray-300">/</span>
                <button
                  onClick={() => setCurrentPrefix(path)}
                  className={`px-2 py-1 rounded ${
                    path === currentPrefix ? "bg-[#6EC6FF] text-white" : "text-[#6EC6FF] hover:underline"
                  }`}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>

        {/* Folders */}
        {(currentPrefix || prefixes.length > 0) && (
          <div className="space-y-1 mb-3">
            {currentPrefix && (
              <button
                onClick={navigateUp}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-600"
              >
                <span>📁</span>
                <span>..</span>
              </button>
            )}
            {prefixes.map((p) => (
              <button
                key={p}
                onClick={() => navigateTo(p)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-600"
              >
                <span>📁</span>
                <span className="font-medium">{p.replace(currentPrefix, "").replace(/\/$/, "")}</span>
              </button>
            ))}
          </div>
        )}

        {/* Files */}
        {files.length === 0 && !loading && prefixes.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">ファイルがありません</p>
        )}
        {files.length > 0 && (
          <div className="space-y-1">
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 px-3 py-1 text-[10px] text-gray-400 font-medium border-b border-gray-100">
              <span></span>
              <span>ファイル名</span>
              <span>サイズ</span>
              <span>更新日時</span>
              <span></span>
            </div>
            {files.map((f) => {
              const name = f.key.replace(currentPrefix, "");
              const isImage = f.contentType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.key);
              return (
                <div
                  key={f.key}
                  className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 items-center px-3 py-2 rounded-lg hover:bg-gray-50 group"
                >
                  <span className="text-sm">{getFileIcon(f.key, f.contentType)}</span>
                  <div className="min-w-0">
                    <a
                      href={`/api/media/${f.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-700 hover:text-[#6EC6FF] truncate block"
                      title={f.key}
                    >
                      {name}
                    </a>
                    {isImage && (
                      <div className="mt-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/media/${f.key}`}
                          alt={name}
                          className="h-10 rounded object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatSize(f.size)}</span>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDate(f.lastModified)}</span>
                  <button
                    onClick={() => handleDelete(f.key)}
                    className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    削除
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400">
          <span>{files.length}ファイル</span>
          <span>合計: {formatSize(files.reduce((s, f) => s + f.size, 0))}</span>
        </div>
      </Card>

      {/* Lifecycle Policy Status */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-700">ライフサイクルポリシー</h3>
          <div className="flex items-center gap-2">
            {lifecycleLoading && <span className="text-xs text-gray-400 animate-pulse">読み込み中...</span>}
            <button onClick={loadLifecycle} className="text-xs text-[#6EC6FF] hover:underline">更新</button>
          </div>
        </div>

        {lifecycle ? (
          <div className="space-y-4">
            {/* Config info */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-500 mb-2">ポリシー設定</p>
              <div className="grid grid-cols-3 gap-3 text-xs text-gray-600">
                <div>
                  <span className="text-gray-400">圧縮開始:</span>{" "}
                  <span className="font-mono font-bold">{lifecycle.config.compressAfterDays}日</span>
                </div>
                <div>
                  <span className="text-gray-400">削除:</span>{" "}
                  <span className="font-mono font-bold">{lifecycle.config.deleteAfterDays}日</span>
                </div>
                <div>
                  <span className="text-gray-400">Cron:</span>{" "}
                  <span className="font-mono text-[10px]">{lifecycle.config.cronSchedule}</span>
                </div>
              </div>
            </div>

            {/* Storage stats */}
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">ストレージ使用量</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-blue-600">{lifecycle.stats.totalCount}</p>
                  <p className="text-[10px] text-gray-500">総ファイル数</p>
                  <p className="text-xs text-blue-500 font-mono">{formatSize(lifecycle.stats.totalSize)}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-green-600">{lifecycle.stats.activeCount}</p>
                  <p className="text-[10px] text-gray-500">アクティブ</p>
                  <p className="text-xs text-green-500 font-mono">{formatSize(lifecycle.stats.activeSize)}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-purple-600">{lifecycle.stats.longTermCount}</p>
                  <p className="text-[10px] text-gray-500">長期保存</p>
                  <p className="text-xs text-purple-500 font-mono">{formatSize(lifecycle.stats.longTermSize)}</p>
                </div>
              </div>
            </div>

            {/* Age distribution */}
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">ファイル経過日数</p>
              <div className="flex gap-1">
                {[
                  { label: "7日未満", count: lifecycle.stats.ageDistribution.recent, color: "bg-green-400" },
                  { label: "7-30日", count: lifecycle.stats.ageDistribution.month, color: "bg-blue-400" },
                  { label: "30-90日", count: lifecycle.stats.ageDistribution.quarter, color: "bg-yellow-400" },
                  { label: "90日-1年", count: lifecycle.stats.ageDistribution.year, color: "bg-orange-400" },
                  { label: "1年以上", count: lifecycle.stats.ageDistribution.old, color: "bg-red-400" },
                ].map((d) => (
                  <div key={d.label} className="flex-1 text-center">
                    <div className={`h-8 rounded-lg ${d.color} flex items-center justify-center`} style={{ opacity: d.count > 0 ? 1 : 0.2 }}>
                      <span className="text-white text-xs font-bold">{d.count}</span>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-1">{d.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* By prefix */}
            {Object.keys(lifecycle.stats.byPrefix).length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2">プレフィックス別</p>
                <div className="space-y-1">
                  {Object.entries(lifecycle.stats.byPrefix)
                    .sort(([, a], [, b]) => b.size - a.size)
                    .map(([prefix, info]) => (
                      <div key={prefix} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                        <span className="font-mono text-gray-600">{prefix}</span>
                        <span className="text-gray-400">{info.count}ファイル / {formatSize(info.size)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Last run */}
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">最終実行</p>
              {lifecycle.lastRun ? (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">実行日時:</span>
                    <span className="font-mono text-gray-600">{new Date(lifecycle.lastRun.timestamp).toLocaleString("ja-JP")}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-sm font-bold text-gray-700">{lifecycle.lastRun.scanned}</p>
                      <p className="text-[10px] text-gray-400">スキャン</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-blue-600">{lifecycle.lastRun.compressed}</p>
                      <p className="text-[10px] text-gray-400">圧縮/移動</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-600">{lifecycle.lastRun.deleted}</p>
                      <p className="text-[10px] text-gray-400">削除</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-orange-600">{lifecycle.lastRun.errors}</p>
                      <p className="text-[10px] text-gray-400">エラー</p>
                    </div>
                  </div>
                  {lifecycle.lastRun.details.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto">
                      {lifecycle.lastRun.details.map((d, i) => (
                        <p key={i} className="text-[10px] text-gray-500 font-mono">{d}</p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-3">まだライフサイクル処理は実行されていません</p>
              )}
            </div>

            {/* Run history */}
            {lifecycle.history.length > 1 && (
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2">実行履歴（直近{lifecycle.history.length}回）</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-1 text-gray-400">日時</th>
                        <th className="text-center py-1 text-gray-400">スキャン</th>
                        <th className="text-center py-1 text-gray-400">圧縮</th>
                        <th className="text-center py-1 text-gray-400">削除</th>
                        <th className="text-center py-1 text-gray-400">エラー</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...lifecycle.history].reverse().map((run, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-1 font-mono text-gray-500">{new Date(run.timestamp).toLocaleDateString("ja-JP")}</td>
                          <td className="py-1 text-center font-mono">{run.scanned}</td>
                          <td className="py-1 text-center font-mono text-blue-600">{run.compressed}</td>
                          <td className="py-1 text-center font-mono text-red-600">{run.deleted}</td>
                          <td className="py-1 text-center font-mono text-orange-600">{run.errors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-4">
            {lifecycleLoading ? "読み込み中..." : "R2が未設定、またはライフサイクルデータがありません"}
          </p>
        )}
      </Card>
    </div>
  );
}

// ===== Matching Debug =====
const TAG_GROUPS: { label: string; tags: { tag: InterestTag; label: string }[] }[] = [
  {
    label: "テーマ (Q1)",
    tags: [
      { tag: "education", label: "教育" },
      { tag: "sports", label: "スポーツ" },
      { tag: "food", label: "食" },
      { tag: "travel", label: "旅行" },
      { tag: "technology", label: "テクノロジー" },
      { tag: "art", label: "アート" },
      { tag: "nature", label: "自然" },
    ],
  },
  {
    label: "サービス (Q2)",
    tags: [
      { tag: "cram_school", label: "学習塾" },
      { tag: "lessons", label: "習い事" },
      { tag: "food_product", label: "食品" },
      { tag: "travel_service", label: "旅行" },
      { tag: "smartphone", label: "スマホ" },
      { tag: "camera", label: "カメラ" },
      { tag: "insurance", label: "保険" },
    ],
  },
  {
    label: "年齢 (Q3)",
    tags: [
      { tag: "age_0_3", label: "0〜3歳" },
      { tag: "age_4_6", label: "4〜6歳" },
      { tag: "age_7_9", label: "7〜9歳" },
      { tag: "age_10_12", label: "10〜12歳" },
      { tag: "age_13_plus", label: "13歳以上" },
    ],
  },
];

const PRESETS: { label: string; tags: InterestTag[] }[] = [
  { label: "教育重視", tags: ["education", "cram_school", "age_4_6"] },
  { label: "スポーツ家族", tags: ["sports", "lessons", "age_7_9"] },
  { label: "テック好き", tags: ["technology", "education", "smartphone", "age_10_12"] },
  { label: "旅行・自然", tags: ["travel", "nature", "travel_service", "age_7_9"] },
  { label: "食 & アート", tags: ["food", "art", "food_product", "age_4_6"] },
  { label: "全タグなし", tags: [] },
];

const TIER_BADGE_COLORS: Record<string, string> = {
  platinum: "bg-blue-100 text-blue-700",
  gold: "bg-yellow-100 text-yellow-700",
  silver: "bg-gray-100 text-gray-600",
  bronze: "bg-orange-100 text-orange-700",
};

// ===== Funnel Analysis =====
function FunnelAnalysisTab({ tenantId }: { tenantId?: string | null }) {
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
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#6EC6FF]"
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
                  <div className="w-full bg-gray-100 rounded-full h-8 relative overflow-hidden">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                  <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
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

function MatchingDebugTab() {
  const [selectedTags, setSelectedTags] = useState<InterestTag[]>([]);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [result, setResult] = useState<CMMatchResult | null>(null);
  const [events] = useState(() => getStoredEvents());

  const toggleTag = (tag: InterestTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const applyPreset = (tags: InterestTag[]) => {
    setSelectedTags(tags);
  };

  const runMatch = () => {
    const eventCompanyIds = eventFilter !== "all"
      ? events.find((e) => e.id === eventFilter)?.companyIds
      : undefined;
    const r = getCMMatch(selectedTags, eventCompanyIds, { includeDebug: true });
    setResult(r);
  };

  const renderScoreBar = (score: number, max: number) => {
    const pct = max > 0 ? Math.min((score / max) * 100, 100) : 0;
    return (
      <div className="w-full bg-gray-100 rounded-full h-3 relative overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-purple-400 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-gray-600">
          {score}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="admin-matching">
      <h2 className="text-lg font-bold text-gray-800">マッチングテスト</h2>
      <p className="text-xs text-gray-400">
        アンケート回答タグを選択して、スコアリングベースのマッチング結果を確認できます。
      </p>

      {/* Quick presets */}
      <Card>
        <p className="text-xs font-bold text-gray-500 mb-2">クイックプリセット</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.tags)}
              className="text-xs px-3 py-1.5 rounded-full bg-purple-50 text-purple-600 hover:bg-purple-100 font-medium transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Tag selector */}
      <Card>
        <p className="text-xs font-bold text-gray-500 mb-3">タグ選択</p>
        <div className="space-y-4">
          {TAG_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] text-gray-400 font-medium mb-1.5">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.tags.map((t) => (
                  <button
                    key={t.tag}
                    onClick={() => toggleTag(t.tag)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                      selectedTags.includes(t.tag)
                        ? "bg-[#6EC6FF] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-gray-400">
          選択中: {selectedTags.length > 0 ? selectedTags.join(", ") : "(なし)"}
        </div>
      </Card>

      {/* Event filter + Run */}
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-500 mb-1">イベントフィルター</p>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className={inputCls}
            >
              <option value="all">全企業（フィルターなし）</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.name} ({evt.companyIds ? `${evt.companyIds.length}社` : "全社"})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={runMatch}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-bold text-sm hover:from-blue-600 hover:to-purple-600 transition-all shadow-md"
            data-testid="matching-run-btn"
          >
            マッチング実行
          </button>
        </div>
      </Card>

      {/* Results */}
      {result && result.debug && (
        <>
          {/* Selected CMs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className={result.platinumCM ? "border-2 border-blue-300" : ""}>
              <p className="text-xs font-bold text-blue-600 mb-2">Platinum CM (15s)</p>
              {result.platinumCM ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.platinumCM.logoUrl} alt="" className="w-10 h-10 rounded-full" />
                  <div>
                    <p className="font-bold text-gray-700 text-sm">{result.platinumCM.name}</p>
                    <p className="text-xs text-gray-400">
                      Score: {result.debug.platinumScores[0]?.totalScore ?? 0}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Platinum企業なし</p>
              )}
            </Card>
            <Card className={result.matchedCM ? "border-2 border-green-300" : ""}>
              <p className="text-xs font-bold text-green-600 mb-2">Matched CM (30s/60s)</p>
              {result.matchedCM ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.matchedCM.logoUrl} alt="" className="w-10 h-10 rounded-full" />
                  <div>
                    <p className="font-bold text-gray-700 text-sm">{result.matchedCM.name}</p>
                    <p className="text-xs text-gray-400">
                      Score: {result.debug.allScores.find((s) => s.companyId === result.matchedCM?.id)?.totalScore ?? 0}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">マッチ企業なし</p>
              )}
            </Card>
          </div>

          {/* Reason */}
          <Card>
            <p className="text-xs font-bold text-gray-500 mb-1">マッチング理由</p>
            <p className="text-xs text-gray-600 font-mono bg-gray-50 p-2 rounded-lg">{result.debug.reason}</p>
          </Card>

          {/* Full ranking table */}
          <Card>
            <p className="text-xs font-bold text-gray-500 mb-3">全企業スコアランキング</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="matching-score-table">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-1 text-gray-500">#</th>
                    <th className="text-left py-2 px-1 text-gray-500">企業名</th>
                    <th className="text-center py-2 px-1 text-gray-500">Tier</th>
                    <th className="text-center py-2 px-1 text-gray-500 w-24">総合</th>
                    <th className="text-center py-2 px-1 text-gray-500">タグ</th>
                    <th className="text-center py-2 px-1 text-gray-500">Tier</th>
                    <th className="text-center py-2 px-1 text-gray-500">年齢</th>
                    <th className="text-center py-2 px-1 text-gray-500">幅広</th>
                    <th className="text-left py-2 px-1 text-gray-500">一致タグ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.debug.allScores.map((s, i) => {
                    const isPlatinum = s.companyId === result.platinumCM?.id;
                    const isMatched = s.companyId === result.matchedCM?.id;
                    const rowBg = isPlatinum ? "bg-blue-50" : isMatched ? "bg-green-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50/50";
                    const maxScore = result.debug!.allScores[0]?.totalScore || 1;
                    return (
                      <tr key={s.companyId} className={`${rowBg} border-b border-gray-50`}>
                        <td className="py-2 px-1 font-mono text-gray-400">{i + 1}</td>
                        <td className="py-2 px-1">
                          <span className="font-medium text-gray-700">{s.companyName}</span>
                          {isPlatinum && <span className="ml-1 text-[9px] bg-blue-200 text-blue-700 px-1 rounded">PT</span>}
                          {isMatched && <span className="ml-1 text-[9px] bg-green-200 text-green-700 px-1 rounded">MT</span>}
                        </td>
                        <td className="py-2 px-1 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${TIER_BADGE_COLORS[s.tier]}`}>
                            {s.tier}
                          </span>
                        </td>
                        <td className="py-2 px-1">{renderScoreBar(s.totalScore, maxScore)}</td>
                        <td className="py-2 px-1 text-center font-mono">{s.breakdown.tagMatchScore}</td>
                        <td className="py-2 px-1 text-center font-mono">{s.breakdown.tierBonus}</td>
                        <td className="py-2 px-1 text-center font-mono">{s.breakdown.ageMatchBonus}</td>
                        <td className="py-2 px-1 text-center font-mono">{s.breakdown.categoryBreadth}</td>
                        <td className="py-2 px-1 text-gray-500 text-[10px]">
                          {s.breakdown.tagMatchDetails.length > 0 ? s.breakdown.tagMatchDetails.join(", ") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ===== Notification Log =====
const NOTIF_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  registration: { label: "参加通知", color: "bg-blue-100 text-blue-700" },
  cm_complete: { label: "CM完了", color: "bg-green-100 text-green-700" },
  license_expiry: { label: "期限通知", color: "bg-yellow-100 text-yellow-700" },
};

const NOTIF_STATUS_COLORS: Record<string, string> = {
  sent: "text-green-600",
  failed: "text-red-600",
  logged: "text-gray-500",
};

function NotificationLogTab() {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    setLogs(getStoredNotificationLog());
  }, []);

  const filtered = typeFilter === "all" ? logs : logs.filter((l) => l.type === typeFilter);
  const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp);

  const typeCounts = {
    registration: logs.filter((l) => l.type === "registration").length,
    cm_complete: logs.filter((l) => l.type === "cm_complete").length,
    license_expiry: logs.filter((l) => l.type === "license_expiry").length,
  };

  return (
    <div className="space-y-4" data-testid="admin-notifications">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">通知ログ</h2>
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#6EC6FF]"
          >
            <option value="all">全タイプ ({logs.length}件)</option>
            <option value="registration">参加通知 ({typeCounts.registration})</option>
            <option value="cm_complete">CM完了 ({typeCounts.cm_complete})</option>
            <option value="license_expiry">期限通知 ({typeCounts.license_expiry})</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(typeCounts).map(([type, count]) => {
          const info = NOTIF_TYPE_LABELS[type] || { label: type, color: "bg-gray-100 text-gray-600" };
          return (
            <Card key={type} className="text-center">
              <p className="text-2xl font-bold text-gray-800">{count}</p>
              <p className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1 ${info.color}`}>{info.label}</p>
            </Card>
          );
        })}
      </div>

      {sorted.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-400 text-center py-6">通知ログがありません</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="notification-log-table">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="p-2 text-left">日時</th>
                  <th className="p-2 text-center">タイプ</th>
                  <th className="p-2 text-left">宛先</th>
                  <th className="p-2 text-left">件名</th>
                  <th className="p-2 text-center">状態</th>
                  <th className="p-2 text-center">送信方法</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((log) => {
                  const typeInfo = NOTIF_TYPE_LABELS[log.type] || { label: log.type, color: "bg-gray-100 text-gray-600" };
                  const dt = new Date(log.timestamp);
                  const dateStr = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
                  return (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="p-2 text-gray-500 font-mono whitespace-nowrap">{dateStr}</td>
                      <td className="p-2 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${typeInfo.color}`}>{typeInfo.label}</span>
                      </td>
                      <td className="p-2 text-gray-600 max-w-[160px] truncate">{log.to}</td>
                      <td className="p-2 text-gray-700 max-w-[240px] truncate" title={log.subject}>{log.subject}</td>
                      <td className={`p-2 text-center font-bold ${NOTIF_STATUS_COLORS[log.status] || "text-gray-500"}`}>
                        {log.status === "sent" ? "送信済" : log.status === "failed" ? "失敗" : "記録済"}
                      </td>
                      <td className="p-2 text-center text-gray-400">{log.method || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-300 mt-2 text-right">最新200件を表示</p>
        </Card>
      )}
    </div>
  );
}

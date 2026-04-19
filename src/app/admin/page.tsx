"use client";

import { useCallback, useEffect, useState } from "react";
import { getAllImageNames } from "@/lib/face-api-client";
import dynamic from "next/dynamic";
import { useSession, signIn, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { EventData } from "@/lib/types";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredEvents,
} from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";

/* ── Loading skeleton for lazy-loaded tabs ── */
function TabSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
      <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-xl" />
    </div>
  );
}

/* ── Dynamic imports — each tab is code-split into its own chunk ── */
const DashboardTab = dynamic(() => import("@/components/admin/tabs/DashboardTab"), { loading: TabSkeleton, ssr: false });
const EventsTab = dynamic(() => import("@/components/admin/tabs/EventsTab"), { loading: TabSkeleton, ssr: false });
const PhotosTab = dynamic(() => import("@/components/admin/tabs/PhotosTab"), { loading: TabSkeleton, ssr: false });
const CompaniesTab = dynamic(() => import("@/components/admin/tabs/CompaniesTab"), { loading: TabSkeleton, ssr: false });
const CMVideosTab = dynamic(() => import("@/components/admin/tabs/CMVideosTab"), { loading: TabSkeleton, ssr: false });
const SurveyTab = dynamic(() => import("@/components/admin/tabs/SurveyTab"), { loading: TabSkeleton, ssr: false });
const StorageTab = dynamic(() => import("@/components/admin/tabs/StorageTab"), { loading: TabSkeleton, ssr: false });
const FunnelAnalysisTab = dynamic(() => import("@/components/admin/tabs/FunnelAnalysisTab"), { loading: TabSkeleton, ssr: false });
const MatchingDebugTab = dynamic(() => import("@/components/admin/tabs/MatchingDebugTab"), { loading: TabSkeleton, ssr: false });
const NotificationLogTab = dynamic(() => import("@/components/admin/tabs/NotificationLogTab"), { loading: TabSkeleton, ssr: false });
const SettingsTab = dynamic(() => import("@/components/admin/tabs/SettingsTab"), { loading: TabSkeleton, ssr: false });
const ExportTab = dynamic(() => import("@/components/admin/tabs/ExportTab"), { loading: TabSkeleton, ssr: false });
const QRAnalyticsTab = dynamic(() => import("@/components/admin/tabs/QRAnalyticsTab"), { loading: TabSkeleton, ssr: false });
const ErrorLogTab = dynamic(() => import("@/components/admin/tabs/ErrorLogTab"), { loading: TabSkeleton, ssr: false });
const SponsorReportTab = dynamic(() => import("@/components/admin/tabs/SponsorReportTab"), { loading: TabSkeleton, ssr: false });
const FramesTab = dynamic(() => import("@/components/admin/tabs/FramesTab"), { loading: TabSkeleton, ssr: false });
const BulkImport = dynamic(() => import("@/components/admin/BulkImport"), { loading: TabSkeleton, ssr: false });
// InvoiceGenerator removed per Yakon's request
const ChartJsAnalytics = dynamic(() => import("@/components/admin/ChartJsAnalytics"), { loading: TabSkeleton, ssr: false });
const LicenseBulkImport = dynamic(() => import("@/components/admin/LicenseBulkImport"), { loading: TabSkeleton, ssr: false });
const TenantManager = dynamic(() => import("@/components/admin/TenantManager"), { loading: TabSkeleton, ssr: false });

type Tab = "events" | "photos" | "companies" | "cmVideos" | "survey" | "dashboard" | "storage" | "matching" | "funnel" | "tenants" | "import" | "reports" | "chartjs" | "licenses" | "notifications" | "errorLog" | "export" | "qrAnalytics" | "settings" | "frames";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState("");
  const [activeEventId, setActiveEventId] = useState<string>("");
  const [adminEvents, setAdminEvents] = useState<EventData[]>([]);
  const [hfPhotoCount, setHfPhotoCount] = useState<number | null>(null);

  // Super admin tenant context switching (still via sessionStorage)
  const [contextTenantId, setContextTenantId] = useState<string | null>(null);

  const authed = status === "authenticated";
  const adminTenantId = session?.user?.tenantId ?? contextTenantId;
  const adminTenantName = session?.user?.tenantName ?? "";

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

  // Fetch real photo count from HF Space
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    getAllImageNames()
      .then((names) => { if (!cancelled) setHfPhotoCount(names.length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authed]);

  const refreshEvents = useCallback(() => {
    const allEvts = getStoredEvents();
    const evts = adminTenantId ? allEvts.filter((e) => e.tenantId === adminTenantId) : allEvts;
    setAdminEvents(evts);
    if (!evts.find((e) => e.id === activeEventId) && evts.length > 0) {
      setActiveEventId(evts[0].id);
    }
  }, [activeEventId, adminTenantId]);

  const activeEvent = adminEvents.find((e) => e.id === activeEventId);

  // Read super admin context tenant from sessionStorage
  useEffect(() => {
    if (session?.user?.role === "super_admin") {
      const tid = sessionStorage.getItem("adminTenantId") || null;
      setContextTenantId(tid);
    }
  }, [session]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    const result = await signIn("credentials", { password: pw, redirect: false });
    if (result?.error) {
      setPwError("パスワードが違います");
    }
  };

  const handleLogout = async () => {
    sessionStorage.removeItem("adminTenantId");
    await signOut({ redirect: false });
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
          <p className="text-sm text-gray-400 dark:text-gray-500">管理画面を読み込み中...</p>
        </div>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 text-center mb-4">
            管理画面ログイン
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <label htmlFor="admin-password" className="sr-only">管理パスワード</label>
            <input
              id="admin-password"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="管理パスワード"
              aria-label="管理パスワード"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-center bg-white dark:bg-gray-700 dark:text-gray-100"
              data-testid="admin-password"
            />
            {pwError && <p className="text-red-400 text-sm text-center" role="alert" aria-live="assertive">{pwError}</p>}
            <Button type="submit" size="md" className="w-full">
              ログイン
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  type TabItem = { key: Tab; label: string; icon: string; demoHidden?: boolean; superOnly?: boolean };
  type TabGroup = { group: string; items: TabItem[] };

  const ALL_TAB_GROUPS: TabGroup[] = [
    {
      group: "イベント運営",
      items: [
        { key: "dashboard", label: "ダッシュボード", icon: "📊" },
        { key: "events", label: "イベント管理", icon: "🎪" },
        { key: "photos", label: "写真管理", icon: "📷" },
        { key: "frames", label: "フレーム管理", icon: "🖼️" },
        { key: "survey", label: "アンケート", icon: "📝" },
        { key: "import", label: "参加者管理", icon: "👥" },
      ],
    },
    {
      group: "スポンサー",
      items: [
        { key: "companies", label: "企業管理", icon: "🏢" },
        { key: "cmVideos", label: "CM動画管理", icon: "🎬" },
        { key: "matching", label: "マッチングテスト", icon: "🎯", demoHidden: true },
      ],
    },
    {
      group: "分析・レポート",
      items: [
        { key: "funnel", label: "完了率分析", icon: "📉" },
        { key: "qrAnalytics", label: "QR分析", icon: "📱" },
        { key: "chartjs", label: "Chart.js分析", icon: "📈" },
        { key: "reports", label: "レポート", icon: "📑" },
        { key: "export", label: "CSVエクスポート", icon: "📤" },
      ],
    },
    {
      group: "システム管理",
      items: [
        { key: "tenants", label: "テナント管理", icon: "🏫", superOnly: true },
        { key: "licenses", label: "ライセンス管理", icon: "🔑", superOnly: true },
        { key: "storage", label: "R2ストレージ", icon: "☁️", demoHidden: true, superOnly: true },
        { key: "notifications", label: "通知ログ", icon: "🔔", superOnly: true },
        { key: "errorLog", label: "エラーログ", icon: "🐛", superOnly: true },
        { key: "settings", label: "設定", icon: "⚙️" },
      ],
    },
  ];

  const TAB_GROUPS = ALL_TAB_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((t) => {
      if (IS_DEMO_MODE && t.demoHidden) return false;
      if (adminTenantId && t.superOnly) return false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900" data-testid="admin-dashboard">
      <AdminHeader
        title={IS_DEMO_MODE ? "VLS Admin (Demo)" : adminTenantName ? `VLS Admin — ${adminTenantName}` : "VLS Admin"}
        onLogout={handleLogout}
        actions={undefined}
      />

      {/* Active event context bar */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-800 border-b border-blue-100 dark:border-gray-700 px-6 py-2">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium flex-shrink-0" id="event-context-label">操作対象:</span>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="radiogroup" aria-labelledby="event-context-label">
            {adminEvents.map((evt) => (
              <button
                key={evt.id}
                role="radio"
                aria-checked={activeEventId === evt.id}
                onClick={() => setActiveEventId(evt.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                  activeEventId === evt.id
                    ? "text-white shadow-sm"
                    : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                }`}
                style={activeEventId === evt.id ? { backgroundColor: "var(--primary)" } : undefined}
                data-testid={`ctx-event-${evt.id}`}
              >
                {evt.name}
                <span className="ml-1 opacity-60">({evt.id === "evt-summer" && hfPhotoCount !== null ? hfPhotoCount : evt.photos.length}枚)</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Tab navigation — grouped by category */}
        <div className="mb-6 space-y-3" role="tablist" aria-label="管理タブ">
          {TAB_GROUPS.map((group) => (
            <div key={group.group}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5 px-1">{group.group}</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {group.items.map((t) => (
                  <button
                    key={t.key}
                    aria-selected={tab === t.key}
                    aria-controls={`tabpanel-${t.key}`}
                    id={`tab-${t.key}`}
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                      tab === t.key
                        ? "text-white shadow-sm"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                    style={tab === t.key ? { backgroundColor: "var(--primary)" } : undefined}
                  >
                    <span aria-hidden="true">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 px-4 py-2 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm text-center"
              data-testid="admin-toast"
              role="status"
              aria-live="polite"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            role="tabpanel"
            id={`tabpanel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "dashboard" && <DashboardTab tenantId={adminTenantId} />}
            {tab === "events" && <EventsTab onSave={(msg) => { showToast(msg); refreshEvents(); }} tenantId={adminTenantId} />}
            {tab === "photos" && <PhotosTab onSave={(msg) => { showToast(msg); refreshEvents(); }} activeEventId={activeEventId} tenantId={adminTenantId} />}
            {tab === "companies" && <CompaniesTab onSave={showToast} />}
            {tab === "cmVideos" && <CMVideosTab onSave={showToast} />}
            {tab === "frames" && <FramesTab />}
            {tab === "survey" && <SurveyTab onSave={showToast} activeEventId={activeEventId} activeEvent={activeEvent} tenantId={adminTenantId} />}
            {tab === "import" && <BulkImport onSave={showToast} tenantId={adminTenantId} />}

            {tab === "reports" && <SponsorReportTab onSave={showToast} tenantId={adminTenantId} />}
            {tab === "funnel" && <FunnelAnalysisTab tenantId={adminTenantId} />}
            {tab === "qrAnalytics" && <QRAnalyticsTab tenantId={adminTenantId} />}
            {tab === "chartjs" && <ChartJsAnalytics tenantId={adminTenantId} />}
            {tab === "licenses" && <LicenseBulkImport onSave={showToast} />}
            {tab === "tenants" && <TenantManager onSave={showToast} />}
            {tab === "notifications" && <NotificationLogTab />}
            {tab === "errorLog" && <ErrorLogTab onSave={showToast} />}
            {tab === "storage" && <StorageTab onSave={showToast} />}
            {tab === "matching" && <MatchingDebugTab />}
            {tab === "export" && <ExportTab onSave={showToast} tenantId={adminTenantId} />}
            {tab === "settings" && <SettingsTab onSave={showToast} tenantId={adminTenantId} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import ReactGridLayout, { Layout, LayoutItem } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredEvents,
  getStoredCompanies,
  getStoredAnalytics,
  getStoredVideoPlays,
  getStoredParticipants,
  getStoredPurchases,
  getStoredPushSubscriptions,
  getStoredNpsResponses,
} from "@/lib/store";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Width measured via ref — no WidthProvider needed

const LAYOUT_KEY = "vls_dashboard_layout";
const VISIBLE_KEY = "vls_dashboard_visible";

// --- Widget definitions ---
interface WidgetDef {
  id: string;
  label: string;
  category: "kpi" | "chart" | "table";
  defaultW: number;
  defaultH: number;
}

const WIDGETS: WidgetDef[] = [
  { id: "kpi-access", label: "総アクセス数", category: "kpi", defaultW: 3, defaultH: 2 },
  { id: "kpi-events", label: "登録イベント", category: "kpi", defaultW: 3, defaultH: 2 },
  { id: "kpi-companies", label: "パートナー企業", category: "kpi", defaultW: 3, defaultH: 2 },
  { id: "kpi-dl-rate", label: "DL完了率", category: "kpi", defaultW: 3, defaultH: 2 },
  { id: "funnel", label: "完了ファネル", category: "chart", defaultW: 6, defaultH: 5 },
  { id: "event-chart", label: "イベント別アクセス", category: "chart", defaultW: 6, defaultH: 5 },
  { id: "cm-pie", label: "CM Tier別分布", category: "chart", defaultW: 4, defaultH: 5 },
  { id: "nps-gauge", label: "NPSスコア", category: "kpi", defaultW: 4, defaultH: 3 },
  { id: "revenue", label: "売上サマリー", category: "kpi", defaultW: 4, defaultH: 3 },
  { id: "push-subs", label: "Push登録数", category: "kpi", defaultW: 3, defaultH: 2 },
  { id: "recent-activity", label: "最近のアクティビティ", category: "table", defaultW: 12, defaultH: 5 },
];

// --- Presets ---
type PresetKey = "overview" | "analytics" | "operations";

const PRESET_LABELS: Record<PresetKey, string> = {
  overview: "概要",
  analytics: "分析",
  operations: "運用",
};

const PRESETS: Record<PresetKey, { visible: string[]; layout: Layout }> = {
  overview: {
    visible: ["kpi-access", "kpi-events", "kpi-companies", "kpi-dl-rate", "funnel", "event-chart", "recent-activity"],
    layout: [
      { i: "kpi-access", x: 0, y: 0, w: 3, h: 2 },
      { i: "kpi-events", x: 3, y: 0, w: 3, h: 2 },
      { i: "kpi-companies", x: 6, y: 0, w: 3, h: 2 },
      { i: "kpi-dl-rate", x: 9, y: 0, w: 3, h: 2 },
      { i: "funnel", x: 0, y: 2, w: 6, h: 5 },
      { i: "event-chart", x: 6, y: 2, w: 6, h: 5 },
      { i: "recent-activity", x: 0, y: 7, w: 12, h: 5 },
    ],
  },
  analytics: {
    visible: ["kpi-access", "kpi-dl-rate", "funnel", "cm-pie", "event-chart", "nps-gauge"],
    layout: [
      { i: "kpi-access", x: 0, y: 0, w: 6, h: 2 },
      { i: "kpi-dl-rate", x: 6, y: 0, w: 6, h: 2 },
      { i: "funnel", x: 0, y: 2, w: 6, h: 5 },
      { i: "cm-pie", x: 6, y: 2, w: 6, h: 5 },
      { i: "event-chart", x: 0, y: 7, w: 8, h: 5 },
      { i: "nps-gauge", x: 8, y: 7, w: 4, h: 5 },
    ],
  },
  operations: {
    visible: ["kpi-events", "kpi-companies", "revenue", "push-subs", "event-chart", "recent-activity"],
    layout: [
      { i: "kpi-events", x: 0, y: 0, w: 3, h: 2 },
      { i: "kpi-companies", x: 3, y: 0, w: 3, h: 2 },
      { i: "revenue", x: 6, y: 0, w: 3, h: 3 },
      { i: "push-subs", x: 9, y: 0, w: 3, h: 2 },
      { i: "event-chart", x: 0, y: 3, w: 12, h: 5 },
      { i: "recent-activity", x: 0, y: 8, w: 12, h: 5 },
    ],
  },
};

const PIE_COLORS = ["#6EC6FF", "#FFD43B", "#ADB5BD", "#FF922B"];

function getDefaultLayout(): Layout {
  return PRESETS.overview.layout;
}

function getDefaultVisible(): string[] {
  return PRESETS.overview.visible;
}

export default function DashboardPage() {
  const { status } = useSession();
  const [layouts, setLayouts] = useState<LayoutItem[]>([]);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  // Data
  const [data, setData] = useState({
    events: [] as ReturnType<typeof getStoredEvents>,
    companies: [] as ReturnType<typeof getStoredCompanies>,
    analytics: [] as ReturnType<typeof getStoredAnalytics>,
    videoPlays: [] as ReturnType<typeof getStoredVideoPlays>,
    participants: [] as ReturnType<typeof getStoredParticipants>,
    purchases: [] as ReturnType<typeof getStoredPurchases>,
    pushSubs: [] as ReturnType<typeof getStoredPushSubscriptions>,
    npsResponses: [] as ReturnType<typeof getStoredNpsResponses>,
  });

  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/admin";
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setData({
      events: getStoredEvents(),
      companies: getStoredCompanies(),
      analytics: getStoredAnalytics(),
      videoPlays: getStoredVideoPlays(),
      participants: getStoredParticipants(),
      purchases: getStoredPurchases(),
      pushSubs: getStoredPushSubscriptions(),
      npsResponses: getStoredNpsResponses(),
    });
    // Load saved layout
    try {
      const savedLayout = localStorage.getItem(LAYOUT_KEY);
      const savedVisible = localStorage.getItem(VISIBLE_KEY);
      setLayouts(savedLayout ? JSON.parse(savedLayout) : [...getDefaultLayout()]);
      setVisibleIds(savedVisible ? JSON.parse(savedVisible) : getDefaultVisible());
    } catch {
      setLayouts([...getDefaultLayout()]);
      setVisibleIds(getDefaultVisible());
    }
    setMounted(true);
  }, [status]);

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(containerRef.current);
    setContainerWidth(containerRef.current.offsetWidth);
    return () => ro.disconnect();
  }, [mounted]);

  // Computed
  const funnel = useMemo(() => {
    const a = data.analytics;
    return [
      { step: "アクセス", count: a.filter((r) => r.stepsCompleted.access).length },
      { step: "アンケート", count: a.filter((r) => r.stepsCompleted.survey).length },
      { step: "CM視聴", count: a.filter((r) => r.stepsCompleted.cmViewed).length },
      { step: "写真閲覧", count: a.filter((r) => r.stepsCompleted.photosViewed).length },
      { step: "DL完了", count: a.filter((r) => r.stepsCompleted.downloaded).length },
    ];
  }, [data.analytics]);

  const eventBarData = useMemo(() => {
    return data.events.map((evt) => {
      const count = data.analytics.filter((r) => r.eventId === evt.id).length;
      return { name: evt.name.slice(0, 8), count };
    });
  }, [data.events, data.analytics]);

  const tierPieData = useMemo(() => {
    const map: Record<string, number> = {};
    data.companies.forEach((c) => {
      map[c.tier] = (map[c.tier] || 0) + 1;
    });
    return Object.entries(map).map(([tier, count]) => ({ tier: tier.toUpperCase(), count }));
  }, [data.companies]);

  const npsScore = useMemo(() => {
    const responded = data.npsResponses.filter((r) => r.score != null);
    if (responded.length === 0) return null;
    const promoters = responded.filter((r) => (r.score ?? 0) >= 9).length;
    const detractors = responded.filter((r) => (r.score ?? 0) <= 6).length;
    return Math.round(((promoters - detractors) / responded.length) * 100);
  }, [data.npsResponses]);

  const revenue = useMemo(() => {
    return data.purchases
      .filter((p) => p.status === "completed")
      .reduce((s, p) => s + p.amount, 0);
  }, [data.purchases]);

  const dlRate = useMemo(() => {
    const total = data.analytics.length;
    if (total === 0) return 0;
    const dl = data.analytics.filter((r) => r.stepsCompleted.downloaded).length;
    return Math.round((dl / total) * 100);
  }, [data.analytics]);

  const recentActivity = useMemo(() => {
    const items: { time: number; label: string; type: string }[] = [];
    data.analytics.slice(-20).forEach((a) => {
      items.push({ time: a.timestamp, label: `${a.respondentName || "匿名"} がアクセス`, type: "access" });
    });
    data.videoPlays.slice(-10).forEach((v) => {
      items.push({ time: v.timestamp, label: `${v.companyName} CM ${v.cmType} ${v.completed ? "完了" : "中断"}`, type: "cm" });
    });
    return items.sort((a, b) => b.time - a.time).slice(0, 10);
  }, [data.analytics, data.videoPlays]);

  // Handlers
  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      setLayouts([...newLayout]);
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(newLayout));
      } catch { /* ignore */ }
    },
    []
  );

  const toggleWidget = (id: string) => {
    setVisibleIds((prev) => {
      const next = prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id];
      try {
        localStorage.setItem(VISIBLE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      // Add default layout for newly shown widget
      if (!prev.includes(id)) {
        const def = WIDGETS.find((w) => w.id === id);
        if (def && !layouts.some((l) => l.i === id)) {
          const newLayout = [
            ...layouts,
            { i: id, x: 0, y: Infinity, w: def.defaultW, h: def.defaultH },
          ];
          setLayouts(newLayout);
          try {
            localStorage.setItem(LAYOUT_KEY, JSON.stringify(newLayout));
          } catch { /* ignore */ }
        }
      }
      return next;
    });
  };

  const applyPreset = (key: PresetKey) => {
    const preset = PRESETS[key];
    setVisibleIds(preset.visible);
    setLayouts([...preset.layout]);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(preset.layout));
      localStorage.setItem(VISIBLE_KEY, JSON.stringify(preset.visible));
    } catch { /* ignore */ }
  };

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // Render widget content
  const renderWidget = (id: string) => {
    switch (id) {
      case "kpi-access":
        return (
          <div className="text-center">
            <p className="text-3xl font-bold text-[#6EC6FF]">{data.analytics.length}</p>
            <p className="text-xs text-gray-400 mt-1">総アクセス数</p>
          </div>
        );
      case "kpi-events":
        return (
          <div className="text-center">
            <p className="text-3xl font-bold text-[#FFD43B]">{data.events.length}</p>
            <p className="text-xs text-gray-400 mt-1">登録イベント</p>
          </div>
        );
      case "kpi-companies":
        return (
          <div className="text-center">
            <p className="text-3xl font-bold text-[#FF6B9D]">{data.companies.length}</p>
            <p className="text-xs text-gray-400 mt-1">パートナー企業</p>
          </div>
        );
      case "kpi-dl-rate":
        return (
          <div className="text-center">
            <p className="text-3xl font-bold text-[#51CF66]">{dlRate}%</p>
            <p className="text-xs text-gray-400 mt-1">DL完了率</p>
          </div>
        );
      case "funnel":
        return (
          <div className="h-full">
            <p className="text-xs font-bold text-gray-500 mb-2">完了ファネル</p>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={funnel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="step" type="category" tick={{ fontSize: 10 }} width={70} />
                <Tooltip />
                <Bar dataKey="count" fill="#6EC6FF" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      case "event-chart":
        return (
          <div className="h-full">
            <p className="text-xs font-bold text-gray-500 mb-2">イベント別アクセス</p>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={eventBarData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#A78BFA" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      case "cm-pie":
        return (
          <div className="h-full">
            <p className="text-xs font-bold text-gray-500 mb-2">CM Tier別分布</p>
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie
                  data={tierPieData}
                  dataKey="count"
                  nameKey="tier"
                  cx="50%"
                  cy="50%"
                  outerRadius="70%"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {tierPieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );
      case "nps-gauge":
        return (
          <div className="text-center">
            <p className="text-xs font-bold text-gray-500 mb-1">NPSスコア</p>
            <p className={`text-4xl font-bold ${npsScore != null && npsScore >= 0 ? "text-green-500" : "text-red-500"}`}>
              {npsScore != null ? npsScore : "—"}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              回答数: {data.npsResponses.filter((r) => r.score != null).length}
            </p>
          </div>
        );
      case "revenue":
        return (
          <div className="text-center">
            <p className="text-xs font-bold text-gray-500 mb-1">総売上</p>
            <p className="text-3xl font-bold text-[#6EC6FF]">
              ¥{revenue.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              {data.purchases.filter((p) => p.status === "completed").length}件完了
            </p>
          </div>
        );
      case "push-subs":
        return (
          <div className="text-center">
            <p className="text-3xl font-bold text-[#A78BFA]">{data.pushSubs.length}</p>
            <p className="text-xs text-gray-400 mt-1">Push通知登録</p>
          </div>
        );
      case "recent-activity":
        return (
          <div className="h-full overflow-auto">
            <p className="text-xs font-bold text-gray-500 mb-2">最近のアクティビティ</p>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">アクティビティなし</p>
            ) : (
              <div className="space-y-1.5">
                {recentActivity.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 font-mono w-10 flex-shrink-0">{fmtDate(a.time)}</span>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      a.type === "access" ? "bg-blue-400" : "bg-green-400"
                    }`} />
                    <span className="text-gray-600 dark:text-gray-300 truncate">{a.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      default:
        return <p className="text-xs text-gray-400">Unknown widget</p>;
    }
  };

  if (status !== "authenticated" || !mounted) return null;

  const visibleLayouts = layouts.filter((l) => visibleIds.includes(l.i));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-4">
        <AdminHeader
          title="カスタムダッシュボード"
          badge={`${visibleIds.length}/${WIDGETS.length}ウィジェット`}
          onLogout={() => signOut({ callbackUrl: "/admin" })}
          actions={
            <div className="flex gap-2 items-center">
              {/* Presets */}
              {(Object.keys(PRESET_LABELS) as PresetKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  aria-label={`${PRESET_LABELS[key]}プリセットを適用`}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                >
                  {PRESET_LABELS[key]}
                </button>
              ))}
              <button
                onClick={() => setShowConfig(!showConfig)}
                aria-label="ウィジェット設定を開く"
                className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                  showConfig
                    ? "bg-[#6EC6FF] text-white"
                    : "bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50"
                }`}
              >
                {showConfig ? "閉じる" : "設定"}
              </button>
            </div>
          }
        />

        {/* Widget toggle panel */}
        {showConfig && (
          <Card>
            <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">表示ウィジェット</h3>
            <div className="flex flex-wrap gap-2">
              {WIDGETS.map((w) => {
                const active = visibleIds.includes(w.id);
                return (
                  <button
                    key={w.id}
                    onClick={() => toggleWidget(w.id)}
                    aria-label={`${w.label}を${active ? "非表示" : "表示"}`}
                    aria-pressed={active}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                      active
                        ? "bg-[#6EC6FF] text-white border-[#6EC6FF]"
                        : "bg-white dark:bg-gray-700 text-gray-400 border-gray-200 dark:border-gray-600 hover:border-[#6EC6FF]"
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">ウィジェットをドラッグ&ドロップで並び替えできます</p>
          </Card>
        )}

        {/* Grid */}
        <div ref={containerRef}>
          {visibleIds.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-400 text-center py-8">
                表示するウィジェットがありません。上の「設定」ボタンからウィジェットを追加してください。
              </p>
            </Card>
          ) : (
            <ReactGridLayout
              className="layout"
              layout={visibleLayouts}
              cols={containerWidth >= 1024 ? 12 : containerWidth >= 768 ? 8 : 4}
              rowHeight={40}
              width={containerWidth}
              isDraggable
              isResizable
              onLayoutChange={handleLayoutChange}
              draggableHandle=".widget-handle"
            >
              {visibleIds.map((id) => {
                const w = WIDGETS.find((w) => w.id === id);
                if (!w) return null;
                return (
                  <div key={id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    {/* Drag handle */}
                    <div className="widget-handle cursor-grab active:cursor-grabbing flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{w.label}</span>
                      <button
                        onClick={() => toggleWidget(id)}
                        aria-label={`${w.label}を非表示`}
                        className="text-[10px] text-gray-300 hover:text-red-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="p-3 h-[calc(100%-32px)] flex items-center justify-center">
                      {renderWidget(id)}
                    </div>
                  </div>
                );
              })}
            </ReactGridLayout>
          )}
        </div>
      </div>
    </div>
  );
}

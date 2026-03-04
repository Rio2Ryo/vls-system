"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import ReactGridLayout, { Layout, LayoutItem } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-grid-layout/css/styles.css";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredEvents,
  getStoredCompanies,
  getStoredAnalytics,
  getStoredVideoPlays,
  getStoredParticipants,
  getStoredPurchases,
  getStoredNpsResponses,
  getStoredTenants,
  getEventsForTenant,
  getAnalyticsForTenant,
  getVideoPlaysForTenant,
  getParticipantsForTenant,
} from "@/lib/store";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { jsPDF } from "jspdf";

/* ================================================================
   Types
   ================================================================ */

interface ReportWidget {
  id: string;
  label: string;
  category: "kpi" | "chart" | "table";
  defaultW: number;
  defaultH: number;
}

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  widgets: string[];
  layout: LayoutItem[];
  dateRange: DateRange;
  tenantId: string | null;
  createdAt: number;
  updatedAt: number;
}

type DateRange = {
  from: string; // yyyy-mm-dd
  to: string;
};

/* ================================================================
   Constants
   ================================================================ */

const TEMPLATE_KEY = "vls_report_templates";
const LAST_REPORT_KEY = "vls_report_last";

const WIDGETS: ReportWidget[] = [
  // KPI
  { id: "kpi-total-access", label: "総アクセス数", category: "kpi", defaultW: 3, defaultH: 2 },
  { id: "kpi-dl-rate", label: "DL完了率", category: "kpi", defaultW: 3, defaultH: 2 },
  { id: "kpi-cm-rate", label: "CM完了率", category: "kpi", defaultW: 3, defaultH: 2 },
  { id: "kpi-avg-nps", label: "平均NPS", category: "kpi", defaultW: 3, defaultH: 2 },
  { id: "kpi-revenue", label: "売上合計", category: "kpi", defaultW: 3, defaultH: 2 },
  { id: "kpi-events", label: "イベント数", category: "kpi", defaultW: 3, defaultH: 2 },
  { id: "kpi-companies", label: "企業数", category: "kpi", defaultW: 3, defaultH: 2 },
  { id: "kpi-participants", label: "参加者数", category: "kpi", defaultW: 3, defaultH: 2 },
  // Charts
  { id: "chart-funnel", label: "ファネルチャート", category: "chart", defaultW: 6, defaultH: 5 },
  { id: "chart-daily", label: "日別アクセス推移", category: "chart", defaultW: 6, defaultH: 5 },
  { id: "chart-event-bar", label: "イベント別比較", category: "chart", defaultW: 6, defaultH: 5 },
  { id: "chart-tier-pie", label: "Tier分布", category: "chart", defaultW: 4, defaultH: 5 },
  { id: "chart-cm-bar", label: "CM再生数", category: "chart", defaultW: 6, defaultH: 5 },
  // Tables
  { id: "table-event-kpi", label: "イベントKPIテーブル", category: "table", defaultW: 12, defaultH: 6 },
  { id: "table-company-cm", label: "企業別CM統計", category: "table", defaultW: 12, defaultH: 6 },
];

const BUILTIN_TEMPLATES: Omit<ReportTemplate, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "エグゼクティブサマリー",
    description: "経営向け主要KPI概要",
    widgets: ["kpi-total-access", "kpi-dl-rate", "kpi-cm-rate", "kpi-avg-nps", "kpi-revenue", "kpi-events", "chart-funnel", "chart-daily"],
    layout: [
      { i: "kpi-total-access", x: 0, y: 0, w: 3, h: 2 },
      { i: "kpi-dl-rate", x: 3, y: 0, w: 3, h: 2 },
      { i: "kpi-cm-rate", x: 6, y: 0, w: 3, h: 2 },
      { i: "kpi-avg-nps", x: 9, y: 0, w: 3, h: 2 },
      { i: "kpi-revenue", x: 0, y: 2, w: 6, h: 2 },
      { i: "kpi-events", x: 6, y: 2, w: 6, h: 2 },
      { i: "chart-funnel", x: 0, y: 4, w: 6, h: 5 },
      { i: "chart-daily", x: 6, y: 4, w: 6, h: 5 },
    ],
    dateRange: { from: "", to: "" },
    tenantId: null,
  },
  {
    name: "スポンサーレポート",
    description: "CM効果測定・企業別統計",
    widgets: ["kpi-cm-rate", "kpi-companies", "chart-tier-pie", "chart-cm-bar", "table-company-cm"],
    layout: [
      { i: "kpi-cm-rate", x: 0, y: 0, w: 6, h: 2 },
      { i: "kpi-companies", x: 6, y: 0, w: 6, h: 2 },
      { i: "chart-tier-pie", x: 0, y: 2, w: 4, h: 5 },
      { i: "chart-cm-bar", x: 4, y: 2, w: 8, h: 5 },
      { i: "table-company-cm", x: 0, y: 7, w: 12, h: 6 },
    ],
    dateRange: { from: "", to: "" },
    tenantId: null,
  },
  {
    name: "イベント詳細分析",
    description: "イベント別KPI比較",
    widgets: ["kpi-total-access", "kpi-dl-rate", "kpi-participants", "chart-event-bar", "chart-funnel", "table-event-kpi"],
    layout: [
      { i: "kpi-total-access", x: 0, y: 0, w: 4, h: 2 },
      { i: "kpi-dl-rate", x: 4, y: 0, w: 4, h: 2 },
      { i: "kpi-participants", x: 8, y: 0, w: 4, h: 2 },
      { i: "chart-event-bar", x: 0, y: 2, w: 6, h: 5 },
      { i: "chart-funnel", x: 6, y: 2, w: 6, h: 5 },
      { i: "table-event-kpi", x: 0, y: 7, w: 12, h: 6 },
    ],
    dateRange: { from: "", to: "" },
    tenantId: null,
  },
];

const PIE_COLORS = ["#6EC6FF", "#FFD43B", "#ADB5BD", "#FF922B"];
/* Reserved for future multi-series charts */
// const CHART_COLORS = ["#6EC6FF", "#A78BFA", "#51CF66", "#FF6B9D", "#FFD43B"];

/* ================================================================
   Helpers
   ================================================================ */

function getTemplates(): ReportTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTemplates(templates: ReportTemplate[]) {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function thirtyDaysAgo(): string {
  const d = new Date(Date.now() - 30 * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toDateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ================================================================
   Component
   ================================================================ */

export default function ReportsPage() {
  const { status } = useSession();

  // State
  const [mounted, setMounted] = useState(false);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [layouts, setLayouts] = useState<LayoutItem[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({ from: thirtyDaysAgo(), to: today() });
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [, setShareUrl] = useState("");
  const [toast, setToast] = useState("");

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
    npsResponses: [] as ReturnType<typeof getStoredNpsResponses>,
    tenants: [] as ReturnType<typeof getStoredTenants>,
  });

  // Toast
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  // Init
  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/admin";
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    loadData();
    setTemplates(getTemplates());
    // Restore last report state
    try {
      const saved = localStorage.getItem(LAST_REPORT_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        setVisibleIds(state.widgets || []);
        setLayouts(state.layout || []);
        if (state.dateRange) setDateRange(state.dateRange);
        if (state.tenantId) setTenantFilter(state.tenantId);
      }
    } catch { /* ignore */ }
    setMounted(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const loadData = () => {
    const tid = tenantFilter === "all" ? null : tenantFilter;
    setData({
      events: tid ? getEventsForTenant(tid) : getStoredEvents(),
      companies: getStoredCompanies(),
      analytics: tid ? getAnalyticsForTenant(tid) : getStoredAnalytics(),
      videoPlays: tid ? getVideoPlaysForTenant(tid) : getStoredVideoPlays(),
      participants: tid ? getParticipantsForTenant(tid) : getStoredParticipants(),
      purchases: getStoredPurchases(),
      npsResponses: getStoredNpsResponses(),
      tenants: getStoredTenants(),
    });
  };

  // Reload data when filters change
  useEffect(() => {
    if (!mounted) return;
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantFilter]);

  // Auto-save current state
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(LAST_REPORT_KEY, JSON.stringify({
        widgets: visibleIds,
        layout: layouts,
        dateRange,
        tenantId: tenantFilter,
      }));
    } catch { /* ignore */ }
  }, [visibleIds, layouts, dateRange, tenantFilter, mounted]);

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(containerRef.current);
    setContainerWidth(containerRef.current.offsetWidth);
    return () => ro.disconnect();
  }, [mounted]);

  /* ── Filtered data by date range ── */
  const filteredAnalytics = useMemo(() => {
    const from = dateRange.from ? new Date(dateRange.from).getTime() : 0;
    const to = dateRange.to ? new Date(dateRange.to).getTime() + 86400000 : Infinity;
    return data.analytics.filter((a) => a.timestamp >= from && a.timestamp < to);
  }, [data.analytics, dateRange]);

  const filteredVideoPlays = useMemo(() => {
    const from = dateRange.from ? new Date(dateRange.from).getTime() : 0;
    const to = dateRange.to ? new Date(dateRange.to).getTime() + 86400000 : Infinity;
    return data.videoPlays.filter((v) => v.timestamp >= from && v.timestamp < to);
  }, [data.videoPlays, dateRange]);

  /* ── Computed KPIs ── */
  const totalAccess = filteredAnalytics.length;
  const dlCount = filteredAnalytics.filter((a) => a.stepsCompleted?.downloaded).length;
  const dlRate = totalAccess > 0 ? Math.round((dlCount / totalAccess) * 100) : 0;
  const cmPlays = filteredVideoPlays.length;
  const cmCompleted = filteredVideoPlays.filter((v) => v.completed).length;
  const cmRate = cmPlays > 0 ? Math.round((cmCompleted / cmPlays) * 100) : 0;
  const npsScores = data.npsResponses.filter((r) => r.score != null);
  const avgNps = npsScores.length > 0 ? Math.round(npsScores.reduce((s, r) => s + (r.score ?? 0), 0) / npsScores.length * 10) / 10 : null;
  const revenue = data.purchases.filter((p) => p.status === "completed").reduce((s, p) => s + p.amount, 0);

  /* ── Chart data ── */
  const funnelData = useMemo(() => [
    { step: "アクセス", count: filteredAnalytics.filter((a) => a.stepsCompleted?.access).length },
    { step: "アンケート", count: filteredAnalytics.filter((a) => a.stepsCompleted?.survey).length },
    { step: "CM視聴", count: filteredAnalytics.filter((a) => a.stepsCompleted?.cmViewed).length },
    { step: "写真閲覧", count: filteredAnalytics.filter((a) => a.stepsCompleted?.photosViewed).length },
    { step: "DL完了", count: filteredAnalytics.filter((a) => a.stepsCompleted?.downloaded).length },
  ], [filteredAnalytics]);

  const dailyData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredAnalytics.forEach((a) => {
      const key = toDateKey(a.timestamp);
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({
      date: date.slice(5), // mm-dd
      count,
    }));
  }, [filteredAnalytics]);

  const eventBarData = useMemo(() => data.events.map((evt) => {
    const evtA = filteredAnalytics.filter((a) => a.eventId === evt.id);
    const evtAccess = evtA.length;
    const evtDl = evtA.filter((a) => a.stepsCompleted?.downloaded).length;
    return {
      name: evt.name.length > 10 ? evt.name.slice(0, 10) + "…" : evt.name,
      fullName: evt.name,
      access: evtAccess,
      dl: evtDl,
      rate: evtAccess > 0 ? Math.round((evtDl / evtAccess) * 100) : 0,
    };
  }), [data.events, filteredAnalytics]);

  const tierPieData = useMemo(() => {
    const map: Record<string, number> = {};
    data.companies.forEach((c) => { map[c.tier] = (map[c.tier] || 0) + 1; });
    return Object.entries(map).map(([tier, count]) => ({ tier: tier.toUpperCase(), count }));
  }, [data.companies]);

  const cmBarData = useMemo(() => {
    const map: Record<string, { name: string; plays: number; completed: number }> = {};
    filteredVideoPlays.forEach((v) => {
      if (!map[v.companyId]) map[v.companyId] = { name: v.companyName?.slice(0, 10) || v.companyId, plays: 0, completed: 0 };
      map[v.companyId].plays++;
      if (v.completed) map[v.companyId].completed++;
    });
    return Object.values(map).sort((a, b) => b.plays - a.plays).slice(0, 10);
  }, [filteredVideoPlays]);

  /* ── Event KPI table data ── */
  const eventKpiRows = useMemo(() => data.events.map((evt) => {
    const evtA = filteredAnalytics.filter((a) => a.eventId === evt.id);
    const evtV = filteredVideoPlays.filter((v) => v.eventId === evt.id);
    const access = evtA.length;
    const survey = evtA.filter((a) => a.stepsCompleted?.survey).length;
    const dl = evtA.filter((a) => a.stepsCompleted?.downloaded).length;
    const cmP = evtV.length;
    const cmC = evtV.filter((v) => v.completed).length;
    return {
      id: evt.id,
      name: evt.name,
      access,
      survey,
      dl,
      dlRate: access > 0 ? Math.round((dl / access) * 100) : 0,
      cmPlays: cmP,
      cmRate: cmP > 0 ? Math.round((cmC / cmP) * 100) : 0,
    };
  }), [data.events, filteredAnalytics, filteredVideoPlays]);

  /* ── Company CM table data ── */
  const companyCmRows = useMemo(() => {
    const map: Record<string, { name: string; tier: string; plays: number; completed: number }> = {};
    data.companies.forEach((c) => { map[c.id] = { name: c.name, tier: c.tier, plays: 0, completed: 0 }; });
    filteredVideoPlays.forEach((v) => {
      if (map[v.companyId]) {
        map[v.companyId].plays++;
        if (v.completed) map[v.companyId].completed++;
      }
    });
    return Object.entries(map).map(([id, d]) => ({
      id,
      ...d,
      rate: d.plays > 0 ? Math.round((d.completed / d.plays) * 100) : 0,
    })).sort((a, b) => b.plays - a.plays);
  }, [data.companies, filteredVideoPlays]);

  /* ================================================================
     Handlers
     ================================================================ */

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    setLayouts([...newLayout]);
  }, []);

  const toggleWidget = (id: string) => {
    setVisibleIds((prev) => {
      const next = prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id];
      if (!prev.includes(id)) {
        const def = WIDGETS.find((w) => w.id === id);
        if (def && !layouts.some((l) => l.i === id)) {
          setLayouts((prev) => [...prev, { i: id, x: 0, y: Infinity, w: def.defaultW, h: def.defaultH }]);
        }
      }
      return next;
    });
  };

  const applyTemplate = (template: Omit<ReportTemplate, "id" | "createdAt" | "updatedAt"> & { id?: string }) => {
    setVisibleIds(template.widgets);
    setLayouts([...template.layout]);
    if (template.dateRange.from) setDateRange(template.dateRange);
    if (template.tenantId) setTenantFilter(template.tenantId);
    setShowTemplates(false);
    showToast(`テンプレート「${template.name}」を適用しました`);
  };

  const handleSaveTemplate = () => {
    if (!saveName.trim()) return;
    const newTemplate: ReportTemplate = {
      id: `tpl_${Date.now()}`,
      name: saveName.trim(),
      description: saveDesc.trim(),
      widgets: visibleIds,
      layout: layouts,
      dateRange,
      tenantId: tenantFilter === "all" ? null : tenantFilter,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [...templates, newTemplate];
    setTemplates(updated);
    saveTemplates(updated);
    setSaveName("");
    setSaveDesc("");
    setShowSaveDialog(false);
    showToast("テンプレートを保存しました");
  };

  const handleDeleteTemplate = (id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    saveTemplates(updated);
    showToast("テンプレートを削除しました");
  };

  const handleShareTemplate = (template: ReportTemplate) => {
    const encoded = btoa(encodeURIComponent(JSON.stringify({
      name: template.name,
      widgets: template.widgets,
      layout: template.layout,
    })));
    const url = `${window.location.origin}/admin/reports?tpl=${encoded}`;
    setShareUrl(url);
    navigator.clipboard.writeText(url).then(() => showToast("共有URLをコピーしました"));
  };

  // Import shared template from URL
  useEffect(() => {
    if (!mounted) return;
    const params = new URLSearchParams(window.location.search);
    const tpl = params.get("tpl");
    if (tpl) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(tpl)));
        setVisibleIds(decoded.widgets || []);
        setLayouts(decoded.layout || []);
        showToast(`共有テンプレート「${decoded.name}」を読み込みました`);
        window.history.replaceState({}, "", window.location.pathname);
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  /* ── CSV Export ── */
  const exportCSV = () => {
    const bom = "\uFEFF";
    let csv = bom;
    // Header
    csv += "イベント,アクセス,アンケート,DL,DL率,CM再生,CM完了率\n";
    eventKpiRows.forEach((r) => {
      csv += `"${r.name}",${r.access},${r.survey},${r.dl},${r.dlRate}%,${r.cmPlays},${r.cmRate}%\n`;
    });
    csv += "\n企業,Tier,CM再生,CM完了,完了率\n";
    companyCmRows.forEach((r) => {
      csv += `"${r.name}",${r.tier},${r.plays},${r.completed},${r.rate}%\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vls-report-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSVをダウンロードしました");
  };

  /* ── PDF Export ── */
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.text("VLS Custom Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Period: ${dateRange.from || "All"} ~ ${dateRange.to || "All"}   Tenant: ${tenantFilter === "all" ? "All" : tenantFilter}`, 14, 28);
    doc.text(`Generated: ${new Date().toLocaleString("ja-JP")}`, 14, 34);

    // KPI Summary
    doc.setFontSize(12);
    doc.text("KPI Summary", 14, 44);
    doc.setFontSize(9);
    const kpis = [
      `Total Access: ${totalAccess}`,
      `DL Rate: ${dlRate}%`,
      `CM Completion: ${cmRate}%`,
      `Avg NPS: ${avgNps ?? "N/A"}`,
      `Revenue: ${revenue.toLocaleString()} JPY`,
      `Events: ${data.events.length}`,
      `Companies: ${data.companies.length}`,
    ];
    kpis.forEach((kpi, i) => {
      doc.text(kpi, 14 + (i % 4) * 65, 52 + Math.floor(i / 4) * 6);
    });

    // Event KPI Table
    let y = 68;
    doc.setFontSize(11);
    doc.text("Event KPI", 14, y);
    y += 6;
    doc.setFontSize(8);
    doc.text("Event", 14, y);
    doc.text("Access", 90, y);
    doc.text("Survey", 110, y);
    doc.text("DL", 130, y);
    doc.text("DL%", 145, y);
    doc.text("CM", 160, y);
    doc.text("CM%", 175, y);
    y += 1;
    doc.line(14, y, w - 14, y);
    y += 4;

    eventKpiRows.forEach((r) => {
      if (y > 190) { doc.addPage(); y = 20; }
      doc.text(r.name.slice(0, 30), 14, y);
      doc.text(String(r.access), 90, y);
      doc.text(String(r.survey), 110, y);
      doc.text(String(r.dl), 130, y);
      doc.text(`${r.dlRate}%`, 145, y);
      doc.text(String(r.cmPlays), 160, y);
      doc.text(`${r.cmRate}%`, 175, y);
      y += 5;
    });

    // Company CM Table
    y += 6;
    if (y > 170) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.text("Company CM Statistics", 14, y);
    y += 6;
    doc.setFontSize(8);
    doc.text("Company", 14, y);
    doc.text("Tier", 90, y);
    doc.text("Plays", 115, y);
    doc.text("Completed", 135, y);
    doc.text("Rate", 165, y);
    y += 1;
    doc.line(14, y, w - 14, y);
    y += 4;

    companyCmRows.slice(0, 20).forEach((r) => {
      if (y > 190) { doc.addPage(); y = 20; }
      doc.text(r.name.slice(0, 30), 14, y);
      doc.text(r.tier, 90, y);
      doc.text(String(r.plays), 115, y);
      doc.text(String(r.completed), 135, y);
      doc.text(`${r.rate}%`, 165, y);
      y += 5;
    });

    doc.save(`vls-report-${today()}.pdf`);
    showToast("PDFをダウンロードしました");
  };

  /* ================================================================
     Render Widget
     ================================================================ */

  const renderWidget = (id: string) => {
    switch (id) {
      case "kpi-total-access":
        return (<div className="text-center"><p className="text-3xl font-bold text-[#6EC6FF]">{totalAccess}</p><p className="text-xs text-gray-400 mt-1">総アクセス数</p></div>);
      case "kpi-dl-rate":
        return (<div className="text-center"><p className="text-3xl font-bold text-[#51CF66]">{dlRate}%</p><p className="text-xs text-gray-400 mt-1">DL完了率</p></div>);
      case "kpi-cm-rate":
        return (<div className="text-center"><p className="text-3xl font-bold text-[#A78BFA]">{cmRate}%</p><p className="text-xs text-gray-400 mt-1">CM完了率</p></div>);
      case "kpi-avg-nps":
        return (<div className="text-center"><p className={`text-3xl font-bold ${avgNps != null && avgNps >= 7 ? "text-green-500" : "text-orange-500"}`}>{avgNps ?? "—"}</p><p className="text-xs text-gray-400 mt-1">平均NPS</p></div>);
      case "kpi-revenue":
        return (<div className="text-center"><p className="text-3xl font-bold text-[#FFD43B]">¥{revenue.toLocaleString()}</p><p className="text-xs text-gray-400 mt-1">売上合計</p></div>);
      case "kpi-events":
        return (<div className="text-center"><p className="text-3xl font-bold text-[#FF6B9D]">{data.events.length}</p><p className="text-xs text-gray-400 mt-1">イベント数</p></div>);
      case "kpi-companies":
        return (<div className="text-center"><p className="text-3xl font-bold text-[#6EC6FF]">{data.companies.length}</p><p className="text-xs text-gray-400 mt-1">企業数</p></div>);
      case "kpi-participants":
        return (<div className="text-center"><p className="text-3xl font-bold text-[#A78BFA]">{data.participants.length}</p><p className="text-xs text-gray-400 mt-1">参加者数</p></div>);

      case "chart-funnel":
        return (
          <div className="h-full">
            <p className="text-xs font-bold text-gray-500 mb-1">ファネルチャート</p>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="step" type="category" tick={{ fontSize: 10 }} width={70} />
                <RTooltip />
                <Bar dataKey="count" fill="#6EC6FF" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case "chart-daily":
        return (
          <div className="h-full">
            <p className="text-xs font-bold text-gray-500 mb-1">日別アクセス推移</p>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RTooltip />
                <Line type="monotone" dataKey="count" stroke="#6EC6FF" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      case "chart-event-bar":
        return (
          <div className="h-full">
            <p className="text-xs font-bold text-gray-500 mb-1">イベント別比較</p>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={eventBarData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RTooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="access" name="アクセス" fill="#6EC6FF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="dl" name="DL" fill="#51CF66" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case "chart-tier-pie":
        return (
          <div className="h-full">
            <p className="text-xs font-bold text-gray-500 mb-1">Tier分布</p>
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie data={tierPieData} dataKey="count" nameKey="tier" cx="50%" cy="50%" outerRadius="70%" label={({ name, value }) => `${name}: ${value}`}>
                  {tierPieData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                </Pie>
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );

      case "chart-cm-bar":
        return (
          <div className="h-full">
            <p className="text-xs font-bold text-gray-500 mb-1">CM再生数 (上位10社)</p>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={cmBarData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RTooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="plays" name="再生" fill="#A78BFA" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="完了" fill="#51CF66" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case "table-event-kpi":
        return (
          <div className="h-full overflow-auto">
            <p className="text-xs font-bold text-gray-500 mb-2">イベントKPIテーブル</p>
            <table className="w-full text-xs min-w-[500px]">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-1.5 text-gray-500 font-medium">イベント</th>
                <th className="text-center py-1.5 text-gray-500 font-medium">アクセス</th>
                <th className="text-center py-1.5 text-gray-500 font-medium">アンケート</th>
                <th className="text-center py-1.5 text-gray-500 font-medium">DL</th>
                <th className="text-center py-1.5 text-gray-500 font-medium">DL率</th>
                <th className="text-center py-1.5 text-gray-500 font-medium">CM再生</th>
                <th className="text-center py-1.5 text-gray-500 font-medium">CM完了率</th>
              </tr></thead>
              <tbody>
                {eventKpiRows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800">
                    <td className="py-1.5 text-gray-700 dark:text-gray-300">{r.name}</td>
                    <td className="text-center py-1.5 font-mono">{r.access}</td>
                    <td className="text-center py-1.5 font-mono">{r.survey}</td>
                    <td className="text-center py-1.5 font-mono">{r.dl}</td>
                    <td className="text-center py-1.5"><span className={`px-1.5 py-0.5 rounded-full font-bold ${r.dlRate >= 70 ? "bg-green-50 text-green-600" : r.dlRate >= 40 ? "bg-yellow-50 text-yellow-600" : "bg-gray-50 text-gray-500"}`}>{r.dlRate}%</span></td>
                    <td className="text-center py-1.5 font-mono">{r.cmPlays}</td>
                    <td className="text-center py-1.5"><span className={`px-1.5 py-0.5 rounded-full font-bold ${r.cmRate >= 70 ? "bg-green-50 text-green-600" : r.cmRate >= 40 ? "bg-yellow-50 text-yellow-600" : "bg-gray-50 text-gray-500"}`}>{r.cmRate}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "table-company-cm":
        return (
          <div className="h-full overflow-auto">
            <p className="text-xs font-bold text-gray-500 mb-2">企業別CM統計</p>
            <table className="w-full text-xs min-w-[400px]">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-1.5 text-gray-500 font-medium">企業名</th>
                <th className="text-center py-1.5 text-gray-500 font-medium">Tier</th>
                <th className="text-center py-1.5 text-gray-500 font-medium">再生数</th>
                <th className="text-center py-1.5 text-gray-500 font-medium">完了数</th>
                <th className="text-center py-1.5 text-gray-500 font-medium">完了率</th>
              </tr></thead>
              <tbody>
                {companyCmRows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800">
                    <td className="py-1.5 text-gray-700 dark:text-gray-300">{r.name}</td>
                    <td className="text-center py-1.5"><span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{r.tier}</span></td>
                    <td className="text-center py-1.5 font-mono">{r.plays}</td>
                    <td className="text-center py-1.5 font-mono">{r.completed}</td>
                    <td className="text-center py-1.5"><span className={`px-1.5 py-0.5 rounded-full font-bold ${r.rate >= 70 ? "bg-green-50 text-green-600" : r.rate >= 40 ? "bg-yellow-50 text-yellow-600" : "bg-gray-50 text-gray-500"}`}>{r.rate}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      default:
        return <p className="text-xs text-gray-400">Unknown widget</p>;
    }
  };

  /* ================================================================
     Render
     ================================================================ */

  if (status !== "authenticated" || !mounted) return null;

  const visibleLayouts = layouts.filter((l) => visibleIds.includes(l.i));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <AdminHeader
        title="カスタムレポートビルダー"
        badge={`${visibleIds.length}ウィジェット`}
        onLogout={() => signOut({ callbackUrl: "/admin" })}
      />

      <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-4">

        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-xl bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm shadow-lg" role="status" aria-live="polite">
            {toast}
          </div>
        )}

        {/* Toolbar */}
        <Card>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            {/* Date range */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium flex-shrink-0">期間:</label>
              <input type="date" value={dateRange.from} onChange={(e) => setDateRange((p) => ({ ...p, from: e.target.value }))} className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]" aria-label="開始日" />
              <span className="text-xs text-gray-400">〜</span>
              <input type="date" value={dateRange.to} onChange={(e) => setDateRange((p) => ({ ...p, to: e.target.value }))} className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]" aria-label="終了日" />
            </div>

            {/* Tenant filter */}
            {data.tenants.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 font-medium flex-shrink-0">テナント:</label>
                <select value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]" aria-label="テナントフィルター">
                  <option value="all">全テナント</option>
                  {data.tenants.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                </select>
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setShowWidgetPicker(!showWidgetPicker)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${showWidgetPicker ? "bg-[#6EC6FF] text-white" : "bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"}`} aria-label="ウィジェット選択">
                {showWidgetPicker ? "閉じる" : "ウィジェット追加"}
              </button>
              <button onClick={() => setShowTemplates(!showTemplates)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${showTemplates ? "bg-[#A78BFA] text-white" : "bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"}`} aria-label="テンプレート">
                テンプレート
              </button>
              <button onClick={() => setShowSaveDialog(true)} className="text-xs px-3 py-1.5 rounded-lg font-medium bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]" aria-label="テンプレート保存">
                保存
              </button>
              <button onClick={exportCSV} className="text-xs px-3 py-1.5 rounded-lg font-medium bg-green-500 text-white hover:bg-green-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400" aria-label="CSVエクスポート">
                CSV
              </button>
              <button onClick={exportPDF} className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-500 text-white hover:bg-red-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400" aria-label="PDFエクスポート">
                PDF
              </button>
            </div>
          </div>
        </Card>

        {/* Widget picker */}
        {showWidgetPicker && (
          <Card>
            <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">ウィジェットを選択</h3>
            {(["kpi", "chart", "table"] as const).map((cat) => {
              const catWidgets = WIDGETS.filter((w) => w.category === cat);
              const catLabel = cat === "kpi" ? "KPI指標" : cat === "chart" ? "チャート" : "テーブル";
              return (
                <div key={cat} className="mb-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{catLabel}</p>
                  <div className="flex flex-wrap gap-2">
                    {catWidgets.map((w) => {
                      const active = visibleIds.includes(w.id);
                      return (
                        <button key={w.id} onClick={() => toggleWidget(w.id)} aria-pressed={active} className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${active ? "bg-[#6EC6FF] text-white border-[#6EC6FF]" : "bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-[#6EC6FF]"}`}>
                          {w.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-gray-400 mt-1">ウィジェットをドラッグ&ドロップで配置を変更できます</p>
          </Card>
        )}

        {/* Template panel */}
        {showTemplates && (
          <Card>
            <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">テンプレート</h3>
            <div className="space-y-4">
              {/* Built-in templates */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">プリセット</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {BUILTIN_TEMPLATES.map((tpl, i) => (
                    <button key={i} onClick={() => applyTemplate(tpl)} className="text-left p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-[#6EC6FF] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]">
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{tpl.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{tpl.description}</p>
                      <p className="text-[10px] text-[#6EC6FF] mt-1">{tpl.widgets.length} ウィジェット</p>
                    </button>
                  ))}
                </div>
              </div>
              {/* Saved templates */}
              {templates.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">保存済み</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {templates.map((tpl) => (
                      <div key={tpl.id} className="p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-200 truncate">{tpl.name}</p>
                            {tpl.description && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{tpl.description}</p>}
                            <p className="text-[10px] text-[#6EC6FF] mt-1">{tpl.widgets.length} ウィジェット</p>
                          </div>
                          <div className="flex gap-1 ml-2 flex-shrink-0">
                            <button onClick={() => applyTemplate(tpl)} className="text-[10px] px-2 py-1 rounded bg-[#6EC6FF] text-white hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]" aria-label={`${tpl.name}を適用`}>適用</button>
                            <button onClick={() => handleShareTemplate(tpl)} className="text-[10px] px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]" aria-label={`${tpl.name}を共有`}>共有</button>
                            <button onClick={() => handleDeleteTemplate(tpl.id)} className="text-[10px] px-2 py-1 rounded bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400" aria-label={`${tpl.name}を削除`}>削除</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Save dialog */}
        {showSaveDialog && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowSaveDialog(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">テンプレートを保存</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">テンプレート名 *</label>
                  <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="例: 月次レポート" className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]" autoFocus />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">説明</label>
                  <input type="text" value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)} placeholder="例: 月初定例報告用" className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]" />
                </div>
                <p className="text-[10px] text-gray-400">{visibleIds.length} ウィジェット + レイアウト + フィルター設定が保存されます</p>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleSaveTemplate} disabled={!saveName.trim()} className="flex-1 text-sm px-4 py-2 rounded-xl bg-[#6EC6FF] text-white font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]">保存</button>
                  <button onClick={() => setShowSaveDialog(false)} className="text-sm px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]">キャンセル</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Grid */}
        <div ref={containerRef}>
          {visibleIds.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <p className="text-lg font-bold text-gray-300 dark:text-gray-600 mb-2">レポートが空です</p>
                <p className="text-sm text-gray-400 mb-4">「ウィジェット追加」ボタンまたはテンプレートからウィジェットを追加してください</p>
                <div className="flex justify-center gap-3">
                  <button onClick={() => setShowWidgetPicker(true)} className="text-sm px-4 py-2 rounded-xl bg-[#6EC6FF] text-white font-medium hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]">ウィジェット追加</button>
                  <button onClick={() => setShowTemplates(true)} className="text-sm px-4 py-2 rounded-xl bg-[#A78BFA] text-white font-medium hover:bg-purple-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]">テンプレートから選ぶ</button>
                </div>
              </div>
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
                    <div className="widget-handle cursor-grab active:cursor-grabbing flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{w.label}</span>
                      <button onClick={() => toggleWidget(id)} aria-label={`${w.label}を非表示`} className="text-[10px] text-gray-300 hover:text-red-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded">
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

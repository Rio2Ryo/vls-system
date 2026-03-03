"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import JSZip from "jszip";
import AdminHeader from "@/components/admin/AdminHeader";
import Card from "@/components/ui/Card";
import {
  getStoredEvents,
  getStoredCompanies,
  getStoredParticipants,
  getStoredAnalytics,
  getStoredVideoPlays,
  getStoredSurvey,
  getStoredPurchases,
  getStoredNpsResponses,
  getStoredAuditLogs,
  getStoredNotificationLog,
  getStoredPushLogs,
  getStoredBehaviorEvents,
  getStoredOfferInteractions,
  getEventsForTenant,
  getAnalyticsForTenant,
  getParticipantsForTenant,
  getVideoPlaysForTenant,
  getNpsForTenant,
  getAuditLogsForTenant,
  // Setters for import
  setStoredEvents,
  setStoredCompanies,
  setStoredParticipants,
  setStoredAnalytics,
  setStoredVideoPlays,
  setStoredSurvey,
  setStoredPurchases,
  setStoredNpsResponses,
  setStoredAuditLogs,
  setStoredNotificationLog,
  setStoredPushLogs,
  setStoredBehaviorEvents,
  setStoredOfferInteractions,
} from "@/lib/store";
import type {
  EventData,
  Company,
  Participant,
  AnalyticsRecord,
  VideoPlayRecord,
  SurveyQuestion,
  Purchase,
  NpsResponse,
  AuditLog,
  NotificationLog,
  PushLog,
  BehaviorEvent,
  OfferInteraction,
} from "@/lib/types";
import { csrfHeaders } from "@/lib/csrf";

// ═══════════════════════════════════════════════════════════════════
// Data source definitions (shared between export & import)
// ═══════════════════════════════════════════════════════════════════

interface DataSource {
  id: string;
  label: string;
  description: string;
  icon: string;
  getData: (tenantId: string | null) => unknown[];
  setData: (data: unknown[]) => void;
  csvHeaders: string[];
  csvRow: (item: unknown) => string[];
  timestampField?: string;
}

function ts(item: unknown, field: string): number {
  const obj = item as Record<string, unknown>;
  return (obj[field] as number) ?? 0;
}

const DATA_SOURCES: DataSource[] = [
  {
    id: "events", label: "イベント", description: "登録されたイベント一覧", icon: "📅",
    getData: (tid) => (tid ? getEventsForTenant(tid) : getStoredEvents()),
    setData: (d) => setStoredEvents(d as EventData[]),
    csvHeaders: ["id", "name", "date", "venue", "password", "status", "tenantId"],
    csvRow: (item) => { const e = item as EventData; return [e.id, e.name, e.date, e.venue ?? "", e.password, e.status ?? "active", e.tenantId ?? ""]; },
  },
  {
    id: "companies", label: "企業", description: "パートナー企業・スポンサー", icon: "🏢",
    getData: () => getStoredCompanies(),
    setData: (d) => setStoredCompanies(d as Company[]),
    csvHeaders: ["id", "name", "tier", "tags", "offerText", "couponCode"],
    csvRow: (item) => { const c = item as Company; return [c.id, c.name, c.tier, c.tags.join(";"), c.offerText, c.couponCode ?? ""]; },
  },
  {
    id: "participants", label: "参加者", description: "イベント参加者・チェックイン状況", icon: "👥",
    getData: (tid) => (tid ? getParticipantsForTenant(tid) : getStoredParticipants()),
    setData: (d) => setStoredParticipants(d as Participant[]),
    csvHeaders: ["id", "eventId", "name", "email", "checkedIn", "checkedInAt", "registeredAt", "tenantId"],
    csvRow: (item) => { const p = item as Participant; return [p.id, p.eventId, p.name, p.email ?? "", String(p.checkedIn), p.checkedInAt ? new Date(p.checkedInAt).toISOString() : "", new Date(p.registeredAt).toISOString(), p.tenantId ?? ""]; },
    timestampField: "registeredAt",
  },
  {
    id: "analytics", label: "アクセス分析", description: "ユーザーアクセスログ・ファネル", icon: "📊",
    getData: (tid) => (tid ? getAnalyticsForTenant(tid) : getStoredAnalytics()),
    setData: (d) => setStoredAnalytics(d as AnalyticsRecord[]),
    csvHeaders: ["id", "eventId", "respondentName", "access", "survey", "cmViewed", "photosViewed", "downloaded", "timestamp"],
    csvRow: (item) => { const a = item as AnalyticsRecord; const s = a.stepsCompleted; return [a.id, a.eventId, a.respondentName ?? "", String(s.access), String(s.survey), String(s.cmViewed), String(s.photosViewed), String(s.downloaded), new Date(a.timestamp).toISOString()]; },
    timestampField: "timestamp",
  },
  {
    id: "videoPlays", label: "CM再生ログ", description: "CM動画の再生・完了記録", icon: "🎬",
    getData: (tid) => (tid ? getVideoPlaysForTenant(tid) : getStoredVideoPlays()),
    setData: (d) => setStoredVideoPlays(d as VideoPlayRecord[]),
    csvHeaders: ["id", "companyId", "companyName", "cmType", "duration", "watchedSeconds", "completed", "eventId", "timestamp"],
    csvRow: (item) => { const v = item as VideoPlayRecord; return [v.id, v.companyId, v.companyName, v.cmType, String(v.duration), String(v.watchedSeconds), String(v.completed), v.eventId, new Date(v.timestamp).toISOString()]; },
    timestampField: "timestamp",
  },
  {
    id: "survey", label: "アンケート設定", description: "グローバルアンケート設問", icon: "📝",
    getData: () => getStoredSurvey(),
    setData: (d) => setStoredSurvey(d as SurveyQuestion[]),
    csvHeaders: ["id", "question", "maxSelections", "options"],
    csvRow: (item) => { const q = item as SurveyQuestion; return [q.id, q.question, String(q.maxSelections), q.options.map((o) => `${o.label}(${o.tag})`).join(";")]; },
  },
  {
    id: "purchases", label: "購入履歴", description: "写真パック決済記録", icon: "💳",
    getData: () => getStoredPurchases(),
    setData: (d) => setStoredPurchases(d as Purchase[]),
    csvHeaders: ["id", "eventId", "participantName", "planName", "amount", "status", "createdAt", "tenantId"],
    csvRow: (item) => { const p = item as Purchase; return [p.id, p.eventId, p.participantName, p.planName, String(p.amount), p.status, new Date(p.createdAt).toISOString(), p.tenantId ?? ""]; },
    timestampField: "createdAt",
  },
  {
    id: "nps", label: "NPS回答", description: "NPSアンケート回答", icon: "⭐",
    getData: (tid) => (tid ? getNpsForTenant(tid) : getStoredNpsResponses()),
    setData: (d) => setStoredNpsResponses(d as NpsResponse[]),
    csvHeaders: ["id", "eventId", "participantName", "score", "comment", "sentAt", "respondedAt"],
    csvRow: (item) => { const n = item as NpsResponse; return [n.id, n.eventId, n.participantName, n.score != null ? String(n.score) : "", n.comment ?? "", new Date(n.sentAt).toISOString(), n.respondedAt ? new Date(n.respondedAt).toISOString() : ""]; },
    timestampField: "sentAt",
  },
  {
    id: "auditLogs", label: "監査ログ", description: "管理者操作ログ", icon: "🔍",
    getData: (tid) => (tid ? getAuditLogsForTenant(tid) : getStoredAuditLogs()),
    setData: (d) => setStoredAuditLogs(d as AuditLog[]),
    csvHeaders: ["id", "action", "actor", "targetType", "targetId", "targetName", "timestamp", "tenantId"],
    csvRow: (item) => { const a = item as AuditLog; return [a.id, a.action, a.actor, a.targetType, a.targetId ?? "", a.targetName ?? "", new Date(a.timestamp).toISOString(), a.tenantId ?? ""]; },
    timestampField: "timestamp",
  },
  {
    id: "notifications", label: "通知ログ", description: "メール送信ログ", icon: "📧",
    getData: () => getStoredNotificationLog(),
    setData: (d) => setStoredNotificationLog(d as NotificationLog[]),
    csvHeaders: ["id", "eventId", "type", "to", "subject", "status", "method", "timestamp"],
    csvRow: (item) => { const n = item as NotificationLog; return [n.id, n.eventId, n.type, n.to, n.subject, n.status, n.method ?? "", new Date(n.timestamp).toISOString()]; },
    timestampField: "timestamp",
  },
  {
    id: "pushLogs", label: "Push配信ログ", description: "Web Push送信記録", icon: "🔔",
    getData: () => getStoredPushLogs(),
    setData: (d) => setStoredPushLogs(d as PushLog[]),
    csvHeaders: ["id", "trigger", "title", "body", "targetCount", "successCount", "failCount", "sentBy", "timestamp"],
    csvRow: (item) => { const p = item as PushLog; return [p.id, p.trigger, p.title, p.body, String(p.targetCount), String(p.successCount), String(p.failCount), p.sentBy, new Date(p.timestamp).toISOString()]; },
    timestampField: "timestamp",
  },
  {
    id: "behavior", label: "行動イベント", description: "ユーザー行動トラッキング", icon: "🖱️",
    getData: () => getStoredBehaviorEvents(),
    setData: (d) => setStoredBehaviorEvents(d as BehaviorEvent[]),
    csvHeaders: ["id", "eventId", "sessionId", "type", "page", "dwellMs", "scrollDepth", "targetElement", "timestamp"],
    csvRow: (item) => { const b = item as BehaviorEvent; return [b.id, b.eventId, b.sessionId, b.type, b.page, b.dwellMs != null ? String(b.dwellMs) : "", b.scrollDepth != null ? String(b.scrollDepth) : "", b.targetElement ?? "", new Date(b.timestamp).toISOString()]; },
    timestampField: "timestamp",
  },
  {
    id: "offers", label: "オファー効果", description: "スポンサーオファーインタラクション", icon: "🎁",
    getData: () => getStoredOfferInteractions(),
    setData: (d) => setStoredOfferInteractions(d as OfferInteraction[]),
    csvHeaders: ["id", "eventId", "companyId", "companyName", "action", "couponCode", "timestamp"],
    csvRow: (item) => { const o = item as OfferInteraction; return [o.id, o.eventId, o.companyId, o.companyName, o.action, o.couponCode ?? "", new Date(o.timestamp).toISOString()]; },
    timestampField: "timestamp",
  },
];

// ═══════════════════════════════════════════════════════════════════
// CSV helpers
// ═══════════════════════════════════════════════════════════════════

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCSV(source: DataSource, data: unknown[]): string {
  const header = source.csvHeaders.map(escapeCSV).join(",");
  const rows = data.map((item) => source.csvRow(item).map(escapeCSV).join(","));
  return [header, ...rows].join("\n");
}

type ExportFormat = "csv" | "json";
type PageTab = "export" | "import";

// ═══════════════════════════════════════════════════════════════════
// Import types
// ═══════════════════════════════════════════════════════════════════

interface ExportMeta {
  exportedAt: string;
  format: ExportFormat;
  sources: string[];
  tenantId: string;
  dateRange?: { from: string | null; to: string | null };
  totalRecords: number;
}

type ImportMode = "merge" | "overwrite";

interface ImportPreviewItem {
  sourceId: string;
  label: string;
  icon: string;
  existingCount: number;
  importCount: number;
  data: unknown[];
  selected: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Page component
// ═══════════════════════════════════════════════════════════════════

export default function ExportPage() {
  const { status } = useSession();
  const [pageTab, setPageTab] = useState<PageTab>("export");

  // --- Export state ---
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastExport, setLastExport] = useState<{ filename: string; size: string; records: number } | null>(null);

  // --- Import state ---
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMeta, setImportMeta] = useState<ExportMeta | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewItem[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ total: number; sources: number } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Tenant scoping
  const tenantId = typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null;

  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/admin";
  }, [status]);

  // ─── Export logic ────────────────────────────────────────────

  const toggleSource = (id: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedSources.size === DATA_SOURCES.length) {
      setSelectedSources(new Set());
    } else {
      setSelectedSources(new Set(DATA_SOURCES.map((s) => s.id)));
    }
  };

  const getFilteredData = useCallback(
    (source: DataSource): unknown[] => {
      let data = source.getData(tenantId);
      if (source.timestampField && (dateFrom || dateTo)) {
        const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
        const toMs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : Infinity;
        data = data.filter((item) => {
          const t = ts(item, source.timestampField!);
          return t >= fromMs && t <= toMs;
        });
      }
      return data;
    },
    [tenantId, dateFrom, dateTo],
  );

  const totalRecords = Array.from(selectedSources).reduce((sum, id) => {
    const source = DATA_SOURCES.find((s) => s.id === id);
    if (!source) return sum;
    return sum + getFilteredData(source).length;
  }, 0);

  const handleExport = useCallback(async () => {
    if (selectedSources.size === 0) return;
    setExporting(true);
    setProgress(0);
    try {
      const zip = new JSZip();
      const sources = DATA_SOURCES.filter((s) => selectedSources.has(s.id));
      let totalRecs = 0;
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        const data = getFilteredData(source);
        totalRecs += data.length;
        if (format === "csv") {
          zip.file(`${source.id}.csv`, "\uFEFF" + toCSV(source, data));
        } else {
          zip.file(`${source.id}.json`, JSON.stringify(data, null, 2));
        }
        setProgress(Math.round(((i + 1) / sources.length) * 100));
        await new Promise((r) => setTimeout(r, 0));
      }
      const meta = {
        exportedAt: new Date().toISOString(),
        format,
        sources: sources.map((s) => s.id),
        tenantId: tenantId ?? "all",
        dateRange: { from: dateFrom || null, to: dateTo || null },
        totalRecords: totalRecs,
      };
      zip.file("_export_meta.json", JSON.stringify(meta, null, 2));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `vls-export-${dateStr}.zip`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setLastExport({
        filename,
        size: blob.size < 1024 ? `${blob.size}B` : blob.size < 1048576 ? `${(blob.size / 1024).toFixed(1)}KB` : `${(blob.size / 1048576).toFixed(1)}MB`,
        records: totalRecs,
      });
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
      setProgress(0);
    }
  }, [selectedSources, format, getFilteredData, tenantId, dateFrom, dateTo]);

  // ─── Import logic ────────────────────────────────────────────

  const resetImport = useCallback(() => {
    setImportFile(null);
    setImportMeta(null);
    setImportPreview([]);
    setImportError(null);
    setImportResult(null);
    setShowConfirmDialog(false);
  }, []);

  const processZipFile = useCallback(async (file: File) => {
    resetImport();
    setImportFile(file);
    setImportError(null);

    try {
      const zip = await JSZip.loadAsync(file);

      // 1. Validate _export_meta.json
      const metaFile = zip.file("_export_meta.json");
      if (!metaFile) {
        setImportError("_export_meta.json が見つかりません。VLSエクスポートZIPではない可能性があります。");
        return;
      }

      const metaStr = await metaFile.async("string");
      let meta: ExportMeta;
      try {
        meta = JSON.parse(metaStr);
      } catch {
        setImportError("_export_meta.json のJSON解析に失敗しました。");
        return;
      }

      if (!meta.sources || !Array.isArray(meta.sources) || !meta.exportedAt) {
        setImportError("_export_meta.json の形式が不正です (sources / exportedAt が必要)。");
        return;
      }

      // Tenant scope check
      if (tenantId && meta.tenantId !== "all" && meta.tenantId !== tenantId) {
        setImportError(
          `テナントスコープ不一致: エクスポート元テナント「${meta.tenantId}」と現在のテナント「${tenantId}」が異なります。`,
        );
        return;
      }

      setImportMeta(meta);

      // 2. Parse each data source
      const preview: ImportPreviewItem[] = [];

      for (const sourceId of meta.sources) {
        const sourceDef = DATA_SOURCES.find((s) => s.id === sourceId);
        if (!sourceDef) continue;

        const ext = meta.format === "json" ? "json" : "csv";
        const dataFile = zip.file(`${sourceId}.${ext}`);
        if (!dataFile) continue;

        let importData: unknown[] = [];

        if (meta.format === "json") {
          const jsonStr = await dataFile.async("string");
          try {
            importData = JSON.parse(jsonStr);
          } catch {
            continue;
          }
        } else {
          // CSV → JSON not supported for import (only JSON format)
          // We'll still show the entry but mark it differently
          const csvStr = await dataFile.async("string");
          // Simple check: count rows
          const lines = csvStr.split("\n").filter((l) => l.trim());
          const rowCount = Math.max(0, lines.length - 1); // minus header
          preview.push({
            sourceId,
            label: sourceDef.label,
            icon: sourceDef.icon,
            existingCount: sourceDef.getData(tenantId).length,
            importCount: rowCount,
            data: [], // CSV import not parsed — we'll show a warning
            selected: false,
          });
          continue;
        }

        if (!Array.isArray(importData)) continue;

        preview.push({
          sourceId,
          label: sourceDef.label,
          icon: sourceDef.icon,
          existingCount: sourceDef.getData(tenantId).length,
          importCount: importData.length,
          data: importData,
          selected: importData.length > 0,
        });
      }

      if (preview.length === 0) {
        setImportError("インポート可能なデータが見つかりません。");
        return;
      }

      setImportPreview(preview);
    } catch (err) {
      setImportError(`ZIPファイルの読み込みに失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`);
    }
  }, [tenantId, resetImport]);

  const toggleImportSource = (sourceId: string) => {
    setImportPreview((prev) =>
      prev.map((item) =>
        item.sourceId === sourceId ? { ...item, selected: !item.selected } : item,
      ),
    );
  };

  const selectedImportSources = useMemo(
    () => importPreview.filter((p) => p.selected && p.data.length > 0),
    [importPreview],
  );

  const handleImportConfirm = useCallback(async () => {
    setShowConfirmDialog(false);
    setImporting(true);
    setImportProgress(0);

    try {
      const sources = selectedImportSources;
      let totalImported = 0;

      for (let i = 0; i < sources.length; i++) {
        const item = sources[i];
        const sourceDef = DATA_SOURCES.find((s) => s.id === item.sourceId);
        if (!sourceDef) continue;

        if (importMode === "overwrite") {
          // Replace all data
          sourceDef.setData(item.data);
        } else {
          // Merge: add items with new IDs, skip duplicates
          const existing = sourceDef.getData(tenantId);
          const existingIds = new Set(
            existing.map((e) => (e as Record<string, unknown>).id as string).filter(Boolean),
          );
          const newItems = item.data.filter((d) => {
            const id = (d as Record<string, unknown>).id as string;
            return !id || !existingIds.has(id);
          });
          sourceDef.setData([...existing, ...newItems]);
          totalImported += newItems.length;
        }

        if (importMode === "overwrite") {
          totalImported += item.data.length;
        }

        // Sync to D1
        try {
          await fetch("/api/db", {
            method: "PUT",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ action: "sync" }),
          });
        } catch {
          // D1 sync is best-effort
        }

        setImportProgress(Math.round(((i + 1) / sources.length) * 100));
        await new Promise((r) => setTimeout(r, 0));
      }

      setImportResult({ total: totalImported, sources: sources.length });
    } catch (err) {
      setImportError(`インポート失敗: ${err instanceof Error ? err.message : "不明なエラー"}`);
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  }, [selectedImportSources, importMode, tenantId]);

  // Drag & drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".zip")) {
        processZipFile(file);
      } else {
        setImportError("ZIPファイルを選択してください。");
      }
    },
    [processZipFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processZipFile(file);
    },
    [processZipFile],
  );

  if (status !== "authenticated") return null;

  const isCSVOnly = importMeta?.format === "csv" && importPreview.every((p) => p.data.length === 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        <AdminHeader
          title="データ管理"
          badge={pageTab === "export" ? `${selectedSources.size}/${DATA_SOURCES.length}選択` : "インポート"}
          onLogout={() => signOut({ callbackUrl: "/admin" })}
        />

        {/* Tab switcher */}
        <div className="flex gap-2" role="tablist" aria-label="エクスポート/インポート切替">
          {(["export", "import"] as PageTab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={pageTab === t}
              onClick={() => setPageTab(t)}
              className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                pageTab === t
                  ? "bg-[#6EC6FF] text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {t === "export" ? "エクスポート" : "インポート (リストア)"}
            </button>
          ))}
        </div>

        {/* ═══════ EXPORT TAB ═══════ */}
        {pageTab === "export" && (
          <>
            {/* Settings row */}
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1">形式</label>
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                  {(["csv", "json"] as ExportFormat[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      aria-pressed={format === f}
                      className={`text-xs px-3 py-1.5 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                        format === f
                          ? "bg-[#6EC6FF] text-white"
                          : "bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600"
                      }`}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1">開始日</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]" aria-label="開始日" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1">終了日</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]" aria-label="終了日" />
              </div>
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline focus:outline-none">日付クリア</button>
              )}
              {tenantId && (
                <span className="text-[10px] bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-1 rounded-full">テナントスコープ適用中</span>
              )}
            </div>

            {/* Data source selector */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm">エクスポート対象</h3>
                <button onClick={selectAll} className="text-[10px] text-[#6EC6FF] hover:underline focus:outline-none" aria-label={selectedSources.size === DATA_SOURCES.length ? "すべて解除" : "すべて選択"}>
                  {selectedSources.size === DATA_SOURCES.length ? "すべて解除" : "すべて選択"}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {DATA_SOURCES.map((source) => {
                  const selected = selectedSources.has(source.id);
                  const count = getFilteredData(source).length;
                  return (
                    <button key={source.id} onClick={() => toggleSource(source.id)} aria-pressed={selected}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                        selected ? "border-[#6EC6FF] bg-blue-50/50 dark:bg-blue-900/20" : "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-600"
                      }`}>
                      <span className="text-lg flex-shrink-0">{source.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold ${selected ? "text-[#6EC6FF]" : "text-gray-700 dark:text-gray-200"}`}>{source.label}</span>
                          <span className="text-[9px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">{count}件</span>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate">{source.description}</p>
                      </div>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${selected ? "border-[#6EC6FF] bg-[#6EC6FF]" : "border-gray-300 dark:border-gray-600"}`}>
                        {selected && <span className="text-white text-[8px] font-bold">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Export action */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {selectedSources.size > 0 ? (
                  <>
                    <span className="font-bold text-gray-700 dark:text-gray-200">{selectedSources.size}</span> 種別 / <span className="font-bold text-gray-700 dark:text-gray-200">{totalRecords.toLocaleString()}</span> 件 → {format.toUpperCase()} ZIP
                  </>
                ) : "エクスポートするデータを選択してください"}
              </div>
              <button onClick={handleExport} disabled={selectedSources.size === 0 || exporting} aria-label="エクスポート開始"
                className={`text-sm px-5 py-2 rounded-xl font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                  selectedSources.size === 0 || exporting ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed" : "bg-[#6EC6FF] text-white hover:bg-[#5BB5EE] shadow-md hover:shadow-lg"
                }`}>
                {exporting ? "エクスポート中..." : "ZIPダウンロード"}
              </button>
            </div>

            {exporting && (
              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-[#6EC6FF] transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} />
              </div>
            )}

            {lastExport && !exporting && (
              <Card>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">✅</span>
                  <div>
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-200">エクスポート完了</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{lastExport.filename} — {lastExport.size} ({lastExport.records.toLocaleString()}件)</p>
                  </div>
                </div>
              </Card>
            )}

            <div className="text-[10px] text-gray-400 space-y-1">
              <p>CSV形式: Excel/スプレッドシートで開けます (BOM付きUTF-8)</p>
              <p>JSON形式: プログラム連携向け (整形済み) — インポート時はJSON形式のみ対応</p>
              <p>各ファイル + _export_meta.json (エクスポート情報) をZIPにまとめてダウンロードします</p>
              {tenantId && <p>テナントスコープ: 選択中テナントに紐づくデータのみエクスポートされます</p>}
            </div>
          </>
        )}

        {/* ═══════ IMPORT TAB ═══════ */}
        {pageTab === "import" && (
          <>
            {/* Drop zone */}
            {!importMeta && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${
                  dragOver
                    ? "border-[#6EC6FF] bg-blue-50/50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                }`}
              >
                <div className="text-4xl mb-3">📦</div>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">
                  VLSエクスポートZIPをドロップ
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  または下のボタンからファイルを選択
                </p>
                <label className="inline-block cursor-pointer">
                  <span className="text-sm px-5 py-2 rounded-xl bg-[#6EC6FF] text-white font-bold hover:bg-[#5BB5EE] shadow-md transition-all">
                    ZIPファイルを選択
                  </span>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={handleFileInput}
                    className="hidden"
                    aria-label="インポートZIPファイル選択"
                  />
                </label>
                <p className="text-[10px] text-gray-400 mt-4">
                  _export_meta.json を含むZIPファイルのみ対応 (JSON形式エクスポート推奨)
                </p>
              </div>
            )}

            {/* Error */}
            {importError && (
              <Card>
                <div className="flex items-center gap-3">
                  <span className="text-xl">⚠️</span>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-red-600 dark:text-red-400">インポートエラー</p>
                    <p className="text-[10px] text-red-500 dark:text-red-400">{importError}</p>
                  </div>
                  <button onClick={resetImport} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline focus:outline-none">リセット</button>
                </div>
              </Card>
            )}

            {/* Meta info */}
            {importMeta && !importResult && (
              <>
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm">ZIPファイル情報</h3>
                      <p className="text-[10px] text-gray-400 mt-0.5">{importFile?.name}</p>
                    </div>
                    <button onClick={resetImport} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline focus:outline-none">別ファイル選択</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">エクスポート日時</span>
                      <p className="font-medium text-gray-700 dark:text-gray-200">{new Date(importMeta.exportedAt).toLocaleString("ja-JP")}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">形式</span>
                      <p className="font-medium text-gray-700 dark:text-gray-200">{importMeta.format.toUpperCase()}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">テナント</span>
                      <p className="font-medium text-gray-700 dark:text-gray-200">{importMeta.tenantId}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">総レコード</span>
                      <p className="font-medium text-gray-700 dark:text-gray-200">{importMeta.totalRecords.toLocaleString()}件</p>
                    </div>
                  </div>
                </Card>

                {/* CSV only warning */}
                {isCSVOnly && (
                  <Card>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">⚠️</span>
                      <div>
                        <p className="text-xs font-bold text-yellow-600 dark:text-yellow-400">CSV形式はインポート非対応</p>
                        <p className="text-[10px] text-yellow-600/70 dark:text-yellow-400/70">
                          インポートにはJSON形式のエクスポートが必要です。エクスポートタブでJSON形式を選択して再エクスポートしてください。
                        </p>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Import mode selection */}
                {!isCSVOnly && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-2">インポートモード</label>
                      <div className="flex gap-3">
                        {(["merge", "overwrite"] as ImportMode[]).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setImportMode(mode)}
                            aria-pressed={importMode === mode}
                            className={`flex-1 p-3 rounded-xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                              importMode === mode
                                ? mode === "overwrite"
                                  ? "border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/20"
                                  : "border-[#6EC6FF] bg-blue-50/50 dark:bg-blue-900/20"
                                : "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800"
                            }`}
                          >
                            <div className="text-xs font-bold text-gray-700 dark:text-gray-200">
                              {mode === "merge" ? "マージ (推奨)" : "上書き"}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {mode === "merge"
                                ? "既存データを保持し、新規IDのレコードのみ追加"
                                : "既存データを完全に置換 (破壊的操作)"}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Data preview */}
                    <Card>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm">インポートプレビュー</h3>
                        <span className="text-[10px] text-gray-400">{selectedImportSources.length}種別選択中</span>
                      </div>
                      <div className="space-y-2">
                        {importPreview.map((item) => {
                          const hasData = item.data.length > 0;
                          return (
                            <button
                              key={item.sourceId}
                              onClick={() => hasData && toggleImportSource(item.sourceId)}
                              disabled={!hasData}
                              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                                !hasData
                                  ? "border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-50 cursor-not-allowed"
                                  : item.selected
                                    ? "border-[#6EC6FF] bg-blue-50/50 dark:bg-blue-900/20"
                                    : "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-200"
                              }`}
                            >
                              <span className="text-lg">{item.icon}</span>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{item.label}</span>
                                {!hasData && <span className="text-[9px] text-yellow-500 ml-2">(CSV — インポート不可)</span>}
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <div className="text-right">
                                  <span className="text-gray-400">既存</span>
                                  <p className="font-mono font-bold text-gray-600 dark:text-gray-300">{item.existingCount.toLocaleString()}</p>
                                </div>
                                <span className="text-gray-300">→</span>
                                <div className="text-right">
                                  <span className={importMode === "overwrite" ? "text-red-400" : "text-blue-400"}>
                                    {importMode === "overwrite" ? "上書き" : "追加"}
                                  </span>
                                  <p className={`font-mono font-bold ${importMode === "overwrite" ? "text-red-500" : "text-blue-500"}`}>
                                    {item.importCount.toLocaleString()}
                                  </p>
                                </div>
                              </div>
                              {hasData && (
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                  item.selected ? "border-[#6EC6FF] bg-[#6EC6FF]" : "border-gray-300 dark:border-gray-600"
                                }`}>
                                  {item.selected && <span className="text-white text-[8px] font-bold">✓</span>}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </Card>

                    {/* Import action */}
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedImportSources.length > 0 ? (
                          <>
                            <span className="font-bold text-gray-700 dark:text-gray-200">{selectedImportSources.length}</span> 種別 /
                            {" "}<span className="font-bold text-gray-700 dark:text-gray-200">
                              {selectedImportSources.reduce((s, i) => s + i.importCount, 0).toLocaleString()}
                            </span> 件 → {importMode === "merge" ? "マージ" : "上書き"}
                          </>
                        ) : "インポートするデータを選択してください"}
                      </div>
                      <button
                        onClick={() => setShowConfirmDialog(true)}
                        disabled={selectedImportSources.length === 0 || importing}
                        aria-label="インポート開始"
                        className={`text-sm px-5 py-2 rounded-xl font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                          selectedImportSources.length === 0 || importing
                            ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                            : importMode === "overwrite"
                              ? "bg-red-500 text-white hover:bg-red-600 shadow-md hover:shadow-lg"
                              : "bg-[#6EC6FF] text-white hover:bg-[#5BB5EE] shadow-md hover:shadow-lg"
                        }`}
                      >
                        {importing ? "インポート中..." : "インポート実行"}
                      </button>
                    </div>
                  </>
                )}

                {importing && (
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${importMode === "overwrite" ? "bg-red-500" : "bg-[#6EC6FF]"}`}
                      style={{ width: `${importProgress}%` }}
                      role="progressbar"
                      aria-valuenow={importProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                )}
              </>
            )}

            {/* Import result */}
            {importResult && (
              <Card>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">✅</span>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-200">インポート完了</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {importResult.sources}種別 / {importResult.total.toLocaleString()}件{importMode === "merge" ? "追加" : "復元"}しました
                    </p>
                  </div>
                  <button
                    onClick={resetImport}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                  >
                    新規インポート
                  </button>
                </div>
              </Card>
            )}

            {/* Help */}
            {!importMeta && !importError && (
              <div className="text-[10px] text-gray-400 space-y-1">
                <p>VLSのエクスポート機能で生成したZIPファイルをインポートできます</p>
                <p>JSON形式のエクスポートのみインポート対応 (CSV形式は非対応)</p>
                <p>マージモード: 既存データを保持し、重複しないレコードのみ追加します</p>
                <p>上書きモード: 選択したデータ種別の既存データを完全に置き換えます (破壊的)</p>
                {tenantId && <p>テナントスコープ: インポート元のテナントIDが現在のテナントと一致する必要があります</p>}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════ Confirmation Dialog ═══════ */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowConfirmDialog(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h3 id="confirm-title" className={`text-base font-bold mb-2 ${importMode === "overwrite" ? "text-red-600 dark:text-red-400" : "text-gray-800 dark:text-gray-100"}`}>
              {importMode === "overwrite" ? "⚠️ 上書きインポート確認" : "インポート確認"}
            </h3>
            <div className="text-xs text-gray-600 dark:text-gray-300 space-y-2 mb-4">
              {importMode === "overwrite" && (
                <p className="text-red-500 dark:text-red-400 font-bold">
                  選択したデータ種別の既存データが完全に置き換えられます。この操作は元に戻せません。
                </p>
              )}
              <p>以下のデータをインポートします:</p>
              <ul className="space-y-1 ml-2">
                {selectedImportSources.map((item) => (
                  <li key={item.sourceId} className="flex items-center gap-2">
                    <span>{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                    <span className="text-gray-400">— {item.importCount.toLocaleString()}件</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="text-xs px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
              >
                キャンセル
              </button>
              <button
                onClick={handleImportConfirm}
                className={`text-xs px-4 py-2 rounded-lg font-bold text-white focus:outline-none focus-visible:ring-2 ${
                  importMode === "overwrite"
                    ? "bg-red-500 hover:bg-red-600 focus-visible:ring-red-400"
                    : "bg-[#6EC6FF] hover:bg-[#5BB5EE] focus-visible:ring-[#6EC6FF]"
                }`}
              >
                {importMode === "overwrite" ? "上書きインポート実行" : "マージインポート実行"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

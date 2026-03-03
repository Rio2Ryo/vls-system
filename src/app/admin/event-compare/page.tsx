"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import { getStoredEvents } from "@/lib/store";
import { EventData } from "@/lib/types";
import { csrfHeaders } from "@/lib/csrf";
import type { EventKPI } from "@/lib/eventCompareReport";

// --- Helpers ---

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] text-sm dark:bg-gray-700 dark:text-gray-100";

const btnCls = "text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] transition-colors";

const btnPrimaryCls = "text-xs px-4 py-2 rounded-lg bg-[#6EC6FF] hover:bg-[#5ab8f5] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] transition-colors";

/** Event colors for funnel bars (up to 8 events) */
const EVENT_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-yellow-500",
  "bg-red-500",
];

const EVENT_COLORS_HEX = [
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f97316",
  "#ec4899",
  "#06b6d4",
  "#eab308",
  "#ef4444",
];

/** Rate color coding: green >= 70%, yellow >= 40%, red < 40% */
function rateColorCls(value: number): string {
  if (value >= 70) return "text-green-600 dark:text-green-400";
  if (value >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

/** Find the best (max) value index in a numeric array */
function bestIndex(values: number[]): number {
  if (values.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[best]) best = i;
  }
  return best;
}

/** Format a rate value as percentage string */
function fmtRate(v: number): string {
  return `${v.toFixed(1)}%`;
}

/** Format NPS score */
function fmtNps(v: number | null): string {
  if (v === null) return "---";
  return v >= 0 ? `+${v}` : `${v}`;
}

// --- CSV Export ---

function downloadKpiCsv(kpis: EventKPI[]): void {
  const header = "イベント名,日付,会場,参加者数,アクセス数,アンケート回答率(%),CM視聴率(%),CM完了率(%),平均視聴秒,写真DL率(%),NPSスコア";
  const rows = kpis.map((k) => {
    const nps = k.npsScore !== null ? String(k.npsScore) : "";
    return [
      `"${k.eventName.replace(/"/g, '""')}"`,
      `"${k.eventDate}"`,
      `"${(k.venue || "").replace(/"/g, '""')}"`,
      k.totalParticipants,
      k.accessCount,
      k.surveyRate.toFixed(1),
      k.cmViewRate.toFixed(1),
      k.cmCompletionRate.toFixed(1),
      k.avgWatchSeconds.toFixed(1),
      k.downloadRate.toFixed(1),
      nps,
    ].join(",");
  });
  const csv = "\uFEFF" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `event-compare-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- KPI Row Definition ---

interface KpiRow {
  label: string;
  key: string;
  getValue: (k: EventKPI) => number;
  format: (v: number) => string;
  isRate?: boolean;
}

const KPI_ROWS: KpiRow[] = [
  { label: "参加者数", key: "totalParticipants", getValue: (k) => k.totalParticipants, format: (v) => String(v) },
  { label: "アクセス数", key: "accessCount", getValue: (k) => k.accessCount, format: (v) => String(v) },
  { label: "アンケート回答率", key: "surveyRate", getValue: (k) => k.surveyRate, format: fmtRate, isRate: true },
  { label: "CM視聴率", key: "cmViewRate", getValue: (k) => k.cmViewRate, format: fmtRate, isRate: true },
  { label: "CM完了率", key: "cmCompletionRate", getValue: (k) => k.cmCompletionRate, format: fmtRate, isRate: true },
  { label: "平均視聴秒", key: "avgWatchSeconds", getValue: (k) => k.avgWatchSeconds, format: (v) => `${v.toFixed(1)}秒` },
  { label: "写真DL率", key: "downloadRate", getValue: (k) => k.downloadRate, format: fmtRate, isRate: true },
  { label: "NPSスコア", key: "npsScore", getValue: (k) => k.npsScore ?? -999, format: (v) => fmtNps(v === -999 ? null : v) },
];

// --- Funnel Steps ---

interface FunnelStep {
  label: string;
  getCount: (k: EventKPI) => number;
  getBase: (k: EventKPI) => number;
}

const FUNNEL_STEPS: FunnelStep[] = [
  { label: "アクセス", getCount: (k) => k.accessCount, getBase: (k) => k.totalParticipants },
  { label: "アンケート", getCount: (k) => k.surveyCount, getBase: (k) => k.accessCount },
  { label: "CM視聴", getCount: (k) => k.cmViewedCount, getBase: (k) => k.accessCount },
  { label: "写真閲覧", getCount: (k) => k.photosViewedCount, getBase: (k) => k.accessCount },
  { label: "ダウンロード", getCount: (k) => k.downloadedCount, getBase: (k) => k.accessCount },
];

// --- Page Component ---

export default function EventComparePage() {
  const { data: session, status } = useSession();

  // State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [kpis, setKpis] = useState<EventKPI[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Redirect if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/admin";
  }, [status]);

  // All events from store
  const allEvents = useMemo<EventData[]>(() => {
    if (status !== "authenticated") return [];
    const tenantId = session?.user?.tenantId ?? (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ?? null;
    const events = getStoredEvents();
    if (tenantId) return events.filter((e) => e.tenantId === tenantId);
    return events;
  }, [status, session]);

  // Recalculate KPIs when selection changes
  useEffect(() => {
    if (selectedIds.size < 2) {
      setKpis([]);
      return;
    }
    const ids = Array.from(selectedIds);
    // Dynamic import to avoid SSR issues with jsPDF dependency
    import("@/lib/eventCompareReport").then((mod) => {
      const result = mod.calcMultiEventKPI(ids);
      setKpis(result);
    }).catch(() => {
      setKpis([]);
    });
  }, [selectedIds]);

  // --- Event Handlers ---

  const handleToggleEvent = useCallback((eventId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === allEvents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allEvents.map((e) => e.id)));
    }
  }, [allEvents, selectedIds.size]);

  const handlePdfDownload = useCallback(async () => {
    if (selectedIds.size < 2) return;
    setPdfLoading(true);
    try {
      const mod = await import("@/lib/eventCompareReport");
      await mod.downloadEventCompareReport(Array.from(selectedIds));
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfLoading(false);
    }
  }, [selectedIds]);

  const handleEmailSend = useCallback(async () => {
    if (selectedIds.size < 2 || !email.trim()) return;
    setEmailSending(true);
    setEmailResult(null);
    try {
      const mod = await import("@/lib/eventCompareReport");
      const reportBase64 = await mod.getEventCompareReportBase64(Array.from(selectedIds));
      const res = await fetch("/api/send-report", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          eventIds: Array.from(selectedIds),
          email: email.trim(),
          reportBase64,
        }),
      });
      if (res.ok) {
        setEmailResult({ ok: true, message: "レポートを送信しました" });
        setEmail("");
      } else {
        const data = await res.json().catch(() => ({ error: "送信に失敗しました" }));
        setEmailResult({ ok: false, message: data.error || "送信に失敗しました" });
      }
    } catch {
      setEmailResult({ ok: false, message: "送信に失敗しました" });
    } finally {
      setEmailSending(false);
    }
  }, [selectedIds, email]);

  const handleCsvExport = useCallback(() => {
    if (kpis.length === 0) return;
    downloadKpiCsv(kpis);
  }, [kpis]);

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setEmailResult(null);
  }, []);

  // --- Computed values ---

  const selectedEventIds = useMemo(() => Array.from(selectedIds), [selectedIds]);

  // Ordered KPIs matching selection order
  const orderedKpis = useMemo(() => {
    const kpiMap = new Map<string, EventKPI>();
    for (const k of kpis) kpiMap.set(k.eventId, k);
    return selectedEventIds.map((id) => kpiMap.get(id)).filter(Boolean) as EventKPI[];
  }, [kpis, selectedEventIds]);

  // Max count for funnel bar scaling
  const funnelMaxCount = useMemo(() => {
    if (orderedKpis.length === 0) return 1;
    let max = 1;
    for (const step of FUNNEL_STEPS) {
      for (const k of orderedKpis) {
        const c = step.getCount(k);
        if (c > max) max = c;
      }
    }
    return max;
  }, [orderedKpis]);

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
          <p className="text-sm text-gray-400 dark:text-gray-500">イベント比較を読み込み中...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title="イベント比較レポート"
        badge={`${selectedIds.size}件選択中`}
        onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
        actions={
          <button
            onClick={handleCsvExport}
            disabled={kpis.length === 0}
            aria-label="CSVエクスポート"
            className={btnCls}
          >
            CSV出力
          </button>
        }
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* === A) Event Multi-Select === */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">
              比較するイベントを選択
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {selectedIds.size}件選択中
              </span>
              <button
                onClick={handleSelectAll}
                aria-label={selectedIds.size === allEvents.length ? "全て解除" : "全て選択"}
                className={btnCls}
              >
                {selectedIds.size === allEvents.length ? "全て解除" : "全て選択"}
              </button>
            </div>
          </div>

          {allEvents.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
              イベントがありません
            </p>
          ) : (
            <div className="space-y-1">
              {allEvents.map((event) => {
                const isSelected = selectedIds.has(event.id);
                const colorIdx = selectedEventIds.indexOf(event.id);
                return (
                  <label
                    key={event.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleEvent(event.id)}
                      aria-label={`${event.name}を選択`}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-[#6EC6FF] focus:ring-[#6EC6FF] focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                    />
                    {isSelected && colorIdx >= 0 && (
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: EVENT_COLORS_HEX[colorIdx % EVENT_COLORS_HEX.length] }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100 block truncate">
                        {event.name}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {event.date}{event.venue ? ` / ${event.venue}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {selectedIds.size > 0 && selectedIds.size < 2 && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-3">
              2件以上のイベントを選択してください
            </p>
          )}
        </Card>

        {/* === B) KPI Comparison Table === */}
        {orderedKpis.length >= 2 && (
          <Card className="!p-0">
            <div className="px-6 pt-5 pb-3">
              <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                KPI比較テーブル
              </h2>
            </div>
            <div className="overflow-x-auto" style={{ touchAction: "pan-x" }}>
              <table className="w-full text-xs min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium sticky left-0 bg-white dark:bg-gray-800 z-10">
                      指標
                    </th>
                    {orderedKpis.map((k, i) => (
                      <th
                        key={k.eventId}
                        className="text-right py-3 px-4 font-medium min-w-[120px]"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: EVENT_COLORS_HEX[i % EVENT_COLORS_HEX.length] }}
                            aria-hidden="true"
                          />
                          <span className="text-gray-700 dark:text-gray-200 truncate max-w-[100px]" title={k.eventName}>
                            {k.eventName}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {KPI_ROWS.map((row) => {
                    const values = orderedKpis.map((k) => row.getValue(k));
                    const best = bestIndex(values.map((v) => (v === -999 ? -Infinity : v)));
                    return (
                      <tr
                        key={row.key}
                        className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="py-2.5 px-4 text-gray-600 dark:text-gray-300 font-medium whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 z-10">
                          {row.label}
                        </td>
                        {orderedKpis.map((k, i) => {
                          const val = row.getValue(k);
                          const formatted = row.format(val);
                          const isBest = i === best && orderedKpis.length > 1;
                          return (
                            <td
                              key={k.eventId}
                              className={`py-2.5 px-4 text-right font-mono whitespace-nowrap ${
                                isBest ? "bg-green-50 dark:bg-green-900/20" : ""
                              } ${row.isRate ? rateColorCls(val) : "text-gray-700 dark:text-gray-200"}`}
                            >
                              {row.key === "npsScore" ? (
                                <span className={val === -999 ? "text-gray-300 dark:text-gray-600" : rateColorCls(val === -999 ? 0 : (val + 100) / 2)}>
                                  {formatted}
                                </span>
                              ) : (
                                formatted
                              )}
                              {isBest && (
                                <span className="ml-1 text-[10px] text-green-500 dark:text-green-400" aria-label="最良値">
                                  ★
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* === C) Funnel Comparison Visualization === */}
        {orderedKpis.length >= 2 && (
          <Card>
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4">
              ファネル比較
            </h2>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-5">
              {orderedKpis.map((k, i) => (
                <div key={k.eventId} className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: EVENT_COLORS_HEX[i % EVENT_COLORS_HEX.length] }}
                    aria-hidden="true"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-300">{k.eventName}</span>
                </div>
              ))}
            </div>

            <div className="space-y-5">
              {FUNNEL_STEPS.map((step) => (
                <div key={step.label}>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {step.label}
                  </p>
                  <div className="space-y-1.5">
                    {orderedKpis.map((k, i) => {
                      const count = step.getCount(k);
                      const base = step.getBase(k);
                      const pct = base > 0 ? (count / base) * 100 : 0;
                      const barWidth = funnelMaxCount > 0 ? Math.max(2, (count / funnelMaxCount) * 100) : 2;
                      return (
                        <div key={k.eventId} className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 w-16 truncate text-right flex-shrink-0" title={k.eventName}>
                            {k.eventName}
                          </span>
                          <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden relative">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${EVENT_COLORS[i % EVENT_COLORS.length]}`}
                              style={{ width: `${barWidth}%` }}
                              role="progressbar"
                              aria-valuenow={count}
                              aria-valuemin={0}
                              aria-valuemax={funnelMaxCount}
                              aria-label={`${k.eventName}: ${count}件 (${pct.toFixed(1)}%)`}
                            />
                          </div>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">
                            {count}件 ({pct.toFixed(1)}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* === D) Action Buttons === */}
        {orderedKpis.length >= 2 && (
          <Card>
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4">
              レポート出力
            </h2>

            <div className="flex flex-col sm:flex-row gap-4">
              {/* PDF Download */}
              <div className="flex-shrink-0">
                <button
                  onClick={handlePdfDownload}
                  disabled={selectedIds.size < 2 || pdfLoading}
                  aria-label="PDFダウンロード"
                  className={btnPrimaryCls}
                >
                  {pdfLoading ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      生成中...
                    </span>
                  ) : (
                    "PDFダウンロード"
                  )}
                </button>
              </div>

              {/* Email Send */}
              <div className="flex-1 min-w-0">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={handleEmailChange}
                    placeholder="メールアドレスを入力..."
                    aria-label="送信先メールアドレス"
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    onClick={handleEmailSend}
                    disabled={selectedIds.size < 2 || !email.trim() || emailSending}
                    aria-label="メールで送信"
                    className={btnPrimaryCls}
                  >
                    {emailSending ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        送信中...
                      </span>
                    ) : (
                      "メールで送信"
                    )}
                  </button>
                </div>
                {emailResult && (
                  <p
                    className={`text-xs mt-2 ${
                      emailResult.ok
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {emailResult.message}
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Empty state when no events or fewer than 2 selected */}
        {allEvents.length > 0 && selectedIds.size === 0 && (
          <Card>
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              上のリストからイベントを2件以上選択すると、比較レポートが表示されます
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}

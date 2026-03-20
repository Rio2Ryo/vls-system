"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import { getStoredAuditLogs, getAuditLogsForTenant } from "@/lib/store";
import { AuditLog, AuditAction } from "@/lib/types";

// --- Action label & color map ---

const ACTION_MAP: Record<AuditAction, { label: string; color: string }> = {
  event_create:   { label: "イベント作成",     color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" },
  event_update:   { label: "イベント更新",     color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  event_delete:   { label: "イベント削除",     color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  event_clone:    { label: "イベント複製",     color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400" },
  photo_upload:   { label: "写真追加",         color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" },
  photo_delete:   { label: "写真削除",         color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  photo_classify: { label: "写真分類",         color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400" },
  photo_score:    { label: "品質スコアリング", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" },
  company_create: { label: "企業追加",         color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" },
  company_update: { label: "企業更新",         color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  company_delete: { label: "企業削除",         color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  survey_update:  { label: "アンケート更新",   color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  tenant_create:  { label: "テナント作成",     color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" },
  tenant_update:  { label: "テナント更新",     color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  tenant_delete:  { label: "テナント削除",     color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  nps_send:       { label: "NPS送信",          color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400" },
  admin_login:    { label: "ログイン",         color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" },
  admin_logout:   { label: "ログアウト",       color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" },
  settings_update:{ label: "設定変更",         color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  checkin:              { label: "チェックイン",         color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400" },
  checkin_bulk:         { label: "一括チェックイン",     color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400" },
  face_reindex_server:  { label: "顔再インデックス(サーバー)", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" },
};

const ALL_ACTIONS = Object.keys(ACTION_MAP) as AuditAction[];

const ITEMS_PER_PAGE = 50;

// --- Helpers ---

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}/${mo}/${da} ${h}:${mi}:${s}`;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

function tryParseDetails(details: string | undefined): string {
  if (!details) return "";
  try {
    const parsed = JSON.parse(details);
    return typeof parsed === "object" ? JSON.stringify(parsed, null, 0) : String(parsed);
  } catch {
    return details;
  }
}

// --- CSV Export ---

function downloadCsv(logs: AuditLog[]): void {
  const header = "timestamp,action,actor,targetType,targetId,targetName,details";
  const rows = logs.map((log) => {
    const ts = formatTimestamp(log.timestamp);
    const action = ACTION_MAP[log.action]?.label ?? log.action;
    const actor = (log.actor ?? "").replace(/"/g, '""');
    const targetType = (log.targetType ?? "").replace(/"/g, '""');
    const targetId = (log.targetId ?? "").replace(/"/g, '""');
    const targetName = (log.targetName ?? "").replace(/"/g, '""');
    const details = (log.details ?? "").replace(/"/g, '""');
    return `"${ts}","${action}","${actor}","${targetType}","${targetId}","${targetName}","${details}"`;
  });
  const csv = "\uFEFF" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Date Range Type ---

type DateRange = "today" | "7d" | "30d" | "all";

// --- Page ---

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] text-sm dark:bg-gray-700 dark:text-gray-100";

export default function AuditPage() {
  const { data: session, status } = useSession();

  // Filter state
  const [search, setSearch] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Redirect if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/admin";
  }, [status]);

  // Tenant awareness
  const tenantId = session?.user?.tenantId ?? (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ?? null;

  // All logs from store
  const allLogs = useMemo<AuditLog[]>(() => {
    if (status !== "authenticated") return [];
    return tenantId ? getAuditLogsForTenant(tenantId) : getStoredAuditLogs();
  }, [tenantId, status]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    let result = [...allLogs];

    // Text search (actor or targetName)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (log) =>
          (log.actor ?? "").toLowerCase().includes(q) ||
          (log.targetName ?? "").toLowerCase().includes(q)
      );
    }

    // Action type filter
    if (actionFilter !== "all") {
      result = result.filter((log) => log.action === actionFilter);
    }

    // Date range filter
    if (dateRange === "today") {
      const todayStart = startOfToday();
      result = result.filter((log) => log.timestamp >= todayStart);
    } else if (dateRange === "7d") {
      const cutoff = daysAgo(7);
      result = result.filter((log) => log.timestamp >= cutoff);
    } else if (dateRange === "30d") {
      const cutoff = daysAgo(30);
      result = result.filter((log) => log.timestamp >= cutoff);
    }

    // Sort newest first
    result.sort((a, b) => b.timestamp - a.timestamp);

    return result;
  }, [allLogs, search, actionFilter, dateRange]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, actionFilter, dateRange]);

  // Paginated logs
  const paginatedLogs = useMemo(() => {
    const start = page * ITEMS_PER_PAGE;
    return filteredLogs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLogs, page]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));

  // --- KPI calculations ---

  const todayCount = useMemo(() => {
    const todayStart = startOfToday();
    return allLogs.filter((log) => log.timestamp >= todayStart).length;
  }, [allLogs]);

  const uniqueActors = useMemo(() => {
    const actors = new Set(allLogs.map((log) => log.actor));
    return actors.size;
  }, [allLogs]);

  const mostFrequentAction = useMemo(() => {
    if (allLogs.length === 0) return "---";
    const counts = new Map<AuditAction, number>();
    for (const log of allLogs) {
      counts.set(log.action, (counts.get(log.action) ?? 0) + 1);
    }
    let maxAction: AuditAction = allLogs[0].action;
    let maxCount = 0;
    for (const [action, count] of Array.from(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxAction = action;
      }
    }
    return ACTION_MAP[maxAction]?.label ?? maxAction;
  }, [allLogs]);

  // --- Event handlers ---

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const handleActionFilterChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setActionFilter(e.target.value);
  }, []);

  const handleDateRangeChange = useCallback((range: DateRange) => {
    setDateRange(range);
  }, []);

  const handlePrevPage = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((p) => Math.min(totalPages - 1, p + 1));
  }, [totalPages]);

  const handleExportCsv = useCallback(() => {
    downloadCsv(filteredLogs);
  }, [filteredLogs]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

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
          <p className="text-sm text-gray-400 dark:text-gray-500">監査ログを読み込み中...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title="管理者監査ログ"
        badge={`${allLogs.length}件`}
        onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
        actions={
          <button
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            aria-label="CSVエクスポート"
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] transition-colors"
          >
            CSV出力
          </button>
        }
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* === KPI Cards === */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "総ログ数", value: String(allLogs.length), icon: "A", color: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
            { label: "本日の操作", value: String(todayCount), icon: "T", color: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
            { label: "ユニーク実行者", value: String(uniqueActors), icon: "U", color: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
            { label: "最頻操作", value: mostFrequentAction, icon: "F", color: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
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

        {/* === Filters === */}
        <Card>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            {/* Text search */}
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                placeholder="実行者名・対象名で検索..."
                aria-label="監査ログ検索"
                className={inputCls}
              />
            </div>

            {/* Action type filter */}
            <div className="w-full sm:w-48">
              <select
                value={actionFilter}
                onChange={handleActionFilterChange}
                aria-label="操作タイプフィルター"
                className={inputCls}
              >
                <option value="all">全て</option>
                {ALL_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {ACTION_MAP[action].label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date range toggle */}
            <div className="flex gap-1">
              {([
                { range: "today" as DateRange, label: "今日" },
                { range: "7d" as DateRange, label: "7日" },
                { range: "30d" as DateRange, label: "30日" },
                { range: "all" as DateRange, label: "全期間" },
              ]).map((item) => (
                <button
                  key={item.range}
                  onClick={() => handleDateRangeChange(item.range)}
                  aria-label={`期間フィルター: ${item.label}`}
                  aria-pressed={dateRange === item.range}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                    dateRange === item.range
                      ? "bg-[#6EC6FF] text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* === Table === */}
        {filteredLogs.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              監査ログはまだありません
            </p>
          </Card>
        ) : (
          <Card className="!p-0">
            <div className="overflow-x-auto" style={{ touchAction: "pan-x" }}>
              <table className="w-full text-xs min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">日時</th>
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">操作</th>
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">実行者</th>
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">対象</th>
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map((log) => {
                    const actionInfo = ACTION_MAP[log.action] ?? { label: log.action, color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" };
                    const detailStr = tryParseDetails(log.details);
                    const isExpanded = expandedId === log.id;
                    const targetDisplay = log.targetName
                      ? `${log.targetType}: ${log.targetName}`
                      : log.targetId
                        ? `${log.targetType}: ${log.targetId}`
                        : log.targetType;

                    return (
                      <tr
                        key={log.id}
                        className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="py-2.5 px-4 text-gray-600 dark:text-gray-300 whitespace-nowrap font-mono">
                          {formatTimestamp(log.timestamp)}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${actionInfo.color}`}>
                            {actionInfo.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-gray-700 dark:text-gray-200 whitespace-nowrap">
                          {log.actor}
                        </td>
                        <td className="py-2.5 px-4 text-gray-500 dark:text-gray-400 max-w-[180px] truncate" title={targetDisplay}>
                          {targetDisplay}
                        </td>
                        <td className="py-2.5 px-4 text-gray-500 dark:text-gray-400 max-w-[200px]">
                          {detailStr ? (
                            <button
                              onClick={() => handleToggleExpand(log.id)}
                              aria-label={isExpanded ? "詳細を閉じる" : "詳細を展開"}
                              className="text-left hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded transition-colors"
                            >
                              {isExpanded ? (
                                <span className="whitespace-pre-wrap break-all">{detailStr}</span>
                              ) : (
                                <span>{truncate(detailStr, 50)}</span>
                              )}
                            </button>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">---</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {filteredLogs.length}件中 {page * ITEMS_PER_PAGE + 1}〜{Math.min((page + 1) * ITEMS_PER_PAGE, filteredLogs.length)}件
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={page === 0}
                  aria-label="前のページ"
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] transition-colors"
                >
                  前へ
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center px-2">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={page >= totalPages - 1}
                  aria-label="次のページ"
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] transition-colors"
                >
                  次へ
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}

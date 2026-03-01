"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { ErrorLogEntry } from "@/lib/errorLog";

interface Props {
  onSave: (msg: string) => void;
}

type SourceFilter = "all" | "client" | "server" | "edge";

export default function ErrorLogTab({ onSave }: Props) {
  const [entries, setEntries] = useState<ErrorLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [routeFilter, setRouteFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/errors");
      if (res.ok) {
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const clearLogs = async () => {
    try {
      const res = await fetch("/api/errors", { method: "DELETE" });
      if (res.ok) {
        setEntries([]);
        onSave("エラーログをクリアしました");
      }
    } catch {
      // Silently fail
    }
  };

  // Unique routes for the filter dropdown
  const uniqueRoutes = Array.from(new Set(entries.map((e) => e.route).filter(Boolean)));

  const filtered = entries.filter((e) => {
    if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
    if (routeFilter && e.route !== routeFilter) return false;
    return true;
  });

  const clientCount = entries.filter((e) => e.source === "client").length;
  const serverCount = entries.filter((e) => e.source === "server").length;

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4" data-testid="admin-errorlog">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center py-3 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
          <p className="text-lg font-bold text-red-700 dark:text-red-400">{entries.length}</p>
          <p className="text-[10px] text-red-600 dark:text-red-500 font-medium">合計エラー</p>
        </div>
        <div className="text-center py-3 rounded-xl bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800">
          <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{clientCount}</p>
          <p className="text-[10px] text-orange-600 dark:text-orange-500 font-medium">クライアント</p>
        </div>
        <div className="text-center py-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
          <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{serverCount}</p>
          <p className="text-[10px] text-blue-600 dark:text-blue-500 font-medium">サーバー</p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label htmlFor="error-source-filter" className="text-xs font-medium text-gray-600 dark:text-gray-400">ソース:</label>
            <select
              id="error-source-filter"
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] text-sm dark:bg-gray-700 dark:text-gray-100"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            >
              <option value="all">すべて</option>
              <option value="client">クライアント</option>
              <option value="server">サーバー</option>
              <option value="edge">エッジ</option>
            </select>
          </div>
          {uniqueRoutes.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="error-route-filter" className="text-xs font-medium text-gray-600 dark:text-gray-400">ルート:</label>
              <select
                id="error-route-filter"
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] text-sm dark:bg-gray-700 dark:text-gray-100"
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
              >
                <option value="">すべて</option>
                {uniqueRoutes.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {filtered.length} 件
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="secondary" onClick={fetchLogs}>更新</Button>
            {entries.length > 0 && (
              <Button size="sm" variant="secondary" onClick={clearLogs}>クリア</Button>
            )}
          </div>
        </div>
      </Card>

      {/* Loading */}
      {loading && (
        <Card>
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">読み込み中...</p>
        </Card>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <Card>
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
            エラーログはありません
          </p>
        </Card>
      )}

      {/* Error list */}
      {!loading && filtered.map((entry) => {
        const isExpanded = expandedId === entry.id;
        const sourceBadge =
          entry.source === "client"
            ? "bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800"
            : entry.source === "server"
            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
            : "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800";

        return (
          <Card key={entry.id}>
            <button
              className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded-lg"
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              aria-expanded={isExpanded}
              aria-label={`エラー: ${entry.error || entry.message}`}
            >
              <div className="flex items-start gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0 mt-0.5 ${sourceBadge}`}>
                  {entry.source}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {entry.error || entry.message}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                    <span>{fmtDate(entry.timestamp)}</span>
                    {entry.route && (
                      <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 rounded">{entry.route}</span>
                    )}
                    {entry.userId && (
                      <span>user: {entry.userId}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{isExpanded ? "▲" : "▼"}</span>
              </div>
            </button>

            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
                {entry.route && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Route</p>
                    <p className="text-xs font-mono text-gray-700 dark:text-gray-300">{entry.route}</p>
                  </div>
                )}
                {entry.userId && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">User ID</p>
                    <p className="text-xs font-mono text-gray-700 dark:text-gray-300">{entry.userId}</p>
                  </div>
                )}
                {entry.url && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">URL</p>
                    <p className="text-xs text-gray-700 dark:text-gray-300 break-all">{entry.url}</p>
                  </div>
                )}
                {entry.userAgent && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">User Agent</p>
                    <p className="text-xs text-gray-700 dark:text-gray-300 break-all">{entry.userAgent}</p>
                  </div>
                )}
                {entry.stack && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Stack Trace</p>
                    <pre className="text-[10px] text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-48">
                      {entry.stack}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

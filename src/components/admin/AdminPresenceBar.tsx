"use client";

import { useMemo } from "react";
import type { AdminPresence, EditLock } from "@/lib/types";

const PAGE_LABELS: Record<string, string> = {
  "/admin": "ダッシュボード",
  "/admin/events": "イベント",
  "/admin/analytics": "アンケート",
  "/admin/stats": "CM統計",
  "/admin/users": "ユーザー",
  "/admin/import": "インポート",
  "/admin/checkin": "チェックイン",
  "/admin/live": "ライブ",
  "/admin/command": "統合管理",
  "/admin/roi": "ROI",
  "/admin/export": "エクスポート",
  "/admin/scheduler": "スケジューラー",
  "/admin/segments": "セグメント",
  "/admin/dashboard": "カスタムDB",
  "/admin/push": "Push",
  "/admin/nps": "NPS",
  "/admin/audit": "監査ログ",
  "/admin/heatmap": "ヒートマップ",
  "/admin/offers": "オファー",
  "/admin/event-compare": "イベント比較",
  "/admin/sponsor-compare": "スポンサー比較",
  "/admin/survey-live": "アンケートLIVE",
  "/admin/ab-test": "A/Bテスト",
  "/admin/engagement": "エンゲージメント",
  "/admin/purchases": "決済",
  "/admin/calendar": "カレンダー",
  "/admin/reports": "レポート",
};

interface AdminPresenceBarProps {
  peers: AdminPresence[];
  locks: EditLock[];
  connected: boolean;
  currentUserId: string;
}

export default function AdminPresenceBar({ peers, locks, connected, currentUserId }: AdminPresenceBarProps) {
  // Group peers by page
  const peersByPage = useMemo(() => {
    const map = new Map<string, AdminPresence[]>();
    for (const p of peers) {
      const list = map.get(p.page) || [];
      list.push(p);
      map.set(p.page, list);
    }
    return map;
  }, [peers]);

  // Locks held by others
  const otherLocks = useMemo(
    () => locks.filter((l) => l.lockedBy !== currentUserId),
    [locks, currentUserId],
  );

  if (peers.length === 0 && otherLocks.length === 0) {
    return connected ? (
      <span className="text-[9px] text-green-400 px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 hidden sm:inline" title="リアルタイム接続中">
        LIVE
      </span>
    ) : null;
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Connection indicator */}
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? "bg-green-400" : "bg-gray-300"}`}
        title={connected ? "リアルタイム接続中" : "オフライン"}
      />

      {/* Peer avatars */}
      <div className="flex -space-x-1.5">
        {peers.slice(0, 5).map((p) => {
          const initials = p.userName.slice(0, 1).toUpperCase();
          const pageLabel = PAGE_LABELS[p.page] || p.page.split("/").pop() || "";
          return (
            <div
              key={p.userId}
              className="relative group"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-white dark:border-gray-900 cursor-default"
                style={{ backgroundColor: p.color }}
                title={`${p.userName} — ${pageLabel}`}
                aria-label={`${p.userName}が${pageLabel}を閲覧中`}
              >
                {initials}
              </div>
              {/* Tooltip */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 hidden group-hover:block z-50">
                <div className="bg-gray-800 text-white text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                  <p className="font-medium">{p.userName}</p>
                  <p className="text-gray-300">{pageLabel}</p>
                </div>
              </div>
            </div>
          );
        })}
        {peers.length > 5 && (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-gray-500 bg-gray-200 dark:bg-gray-700 dark:text-gray-300 border-2 border-white dark:border-gray-900"
            title={`他 ${peers.length - 5}名`}
          >
            +{peers.length - 5}
          </div>
        )}
      </div>

      {/* Page breakdown (hover only) */}
      {peersByPage.size > 0 && (
        <div className="relative group hidden sm:block">
          <span className="text-[9px] text-gray-400 dark:text-gray-500 cursor-default">
            {peers.length}人がオンライン
          </span>
          <div className="absolute top-full right-0 mt-1 hidden group-hover:block z-50">
            <div className="bg-gray-800 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg min-w-[140px]">
              {Array.from(peersByPage.entries()).map(([page, users]) => (
                <div key={page} className="flex justify-between gap-3 py-0.5">
                  <span className="text-gray-300">{PAGE_LABELS[page] || page}</span>
                  <span className="font-mono">{users.map((u) => u.userName).join(", ")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Lock indicators */}
      {otherLocks.length > 0 && (
        <span
          className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 hidden sm:inline"
          title={otherLocks.map((l) => `${l.recordType}:${l.recordId} by ${l.lockedByName}`).join(", ")}
        >
          🔒 {otherLocks.length}
        </span>
      )}
    </div>
  );
}

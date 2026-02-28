"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import { EventData, Participant } from "@/lib/types";
import {
  getStoredEvents,
  getStoredParticipants,
  setStoredParticipants,
  getParticipantsForEvent,
} from "@/lib/store";

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";

export default function CheckinPage() {
  const { data: session, status } = useSession();

  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [searchText, setSearchText] = useState("");
  const [toast, setToast] = useState("");
  const [showCheckedIn, setShowCheckedIn] = useState(true);
  const [sortKey, setSortKey] = useState<"name" | "time" | "status">("name");

  const tenantId = session?.user?.tenantId ?? (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ?? null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }, []);

  // Load data after auth
  useEffect(() => {
    if (status !== "authenticated") return;
    const allEvts = getStoredEvents();
    const evts = tenantId ? allEvts.filter((e) => e.tenantId === tenantId) : allEvts;
    setEvents(evts);
    if (evts.length > 0 && !selectedEventId) setSelectedEventId(evts[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tenantId]);

  // Load participants when event changes
  useEffect(() => {
    if (!selectedEventId) {
      setParticipants([]);
      return;
    }
    setParticipants(getParticipantsForEvent(selectedEventId));
  }, [selectedEventId]);

  const toggleCheckin = (participantId: string) => {
    const allParticipants = getStoredParticipants();
    const target = allParticipants.find((p) => p.id === participantId);
    if (!target) return;

    const now = Date.now();
    const updated = allParticipants.map((p) =>
      p.id === participantId
        ? {
            ...p,
            checkedIn: !p.checkedIn,
            checkedInAt: !p.checkedIn ? now : undefined,
          }
        : p
    );
    setStoredParticipants(updated);
    setParticipants(updated.filter((p) => p.eventId === selectedEventId));

    if (!target.checkedIn) {
      showToast(`${target.name} をチェックインしました`);
    } else {
      showToast(`${target.name} のチェックインを取り消しました`);
    }
  };

  const bulkCheckinAll = () => {
    const allParticipants = getStoredParticipants();
    const now = Date.now();
    const eventParticipantIds = new Set(participants.map((p) => p.id));
    const updated = allParticipants.map((p) =>
      eventParticipantIds.has(p.id) && !p.checkedIn
        ? { ...p, checkedIn: true, checkedInAt: now }
        : p
    );
    setStoredParticipants(updated);
    setParticipants(updated.filter((p) => p.eventId === selectedEventId));
    const count = participants.filter((p) => !p.checkedIn).length;
    showToast(`${count}名を一括チェックインしました`);
  };

  const resetAll = () => {
    const allParticipants = getStoredParticipants();
    const eventParticipantIds = new Set(participants.map((p) => p.id));
    const updated = allParticipants.map((p) =>
      eventParticipantIds.has(p.id)
        ? { ...p, checkedIn: false, checkedInAt: undefined }
        : p
    );
    setStoredParticipants(updated);
    setParticipants(updated.filter((p) => p.eventId === selectedEventId));
    showToast("チェックイン状態をリセットしました");
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
          <p className="text-sm text-gray-400 dark:text-gray-500">チェックイン画面を読み込み中...</p>
        </div>
      </main>
    );
  }

  // Filter and sort participants
  const filtered = participants.filter((p) => {
    if (!showCheckedIn && p.checkedIn) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case "name":
        return a.name.localeCompare(b.name, "ja");
      case "time":
        return (b.checkedInAt || 0) - (a.checkedInAt || 0);
      case "status":
        return (a.checkedIn ? 1 : 0) - (b.checkedIn ? 1 : 0);
      default:
        return 0;
    }
  });

  const checkedInCount = participants.filter((p) => p.checkedIn).length;
  const totalCount = participants.length;
  const checkinRate = totalCount > 0 ? Math.round((checkedInCount / totalCount) * 100) : 0;

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const formatTime = (ts?: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title="チェックイン"
        badge={selectedEvent ? selectedEvent.name : undefined}
        onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="px-4 py-2 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm text-center"
              role="status"
              aria-live="polite"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Event selector */}
        <Card>
          <label className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2 block">対象イベント</label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className={inputCls}
            data-testid="checkin-event-select"
          >
            {events.length === 0 && <option value="">イベントなし</option>}
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>
                {evt.name} ({evt.date || "日付なし"})
              </option>
            ))}
          </select>
        </Card>

        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="text-center">
            <p className="text-3xl font-bold text-blue-600">{totalCount}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">参加者数</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-green-600">{checkedInCount}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">チェックイン済</p>
          </Card>
          <Card className="text-center">
            <p className={`text-3xl font-bold ${checkinRate >= 80 ? "text-green-600" : checkinRate >= 50 ? "text-yellow-600" : "text-gray-500"}`}>
              {totalCount > 0 ? `${checkinRate}%` : "—"}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">出席率</p>
          </Card>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div
            className="bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden"
            role="progressbar"
            aria-valuenow={checkinRate}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`チェックイン進捗: ${checkinRate}%`}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${checkinRate}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        )}

        {/* Controls */}
        {totalCount > 0 && (
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <input
                  className={inputCls + " pl-8"}
                  placeholder="名前・メールで検索"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  data-testid="checkin-search"
                  aria-label="参加者を名前またはメールで検索"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm pointer-events-none">
                  🔍
                </span>
              </div>

              {/* Sort */}
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as "name" | "time" | "status")}
                aria-label="並び替え"
                className="text-xs px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] bg-white dark:bg-gray-700 dark:text-gray-200"
              >
                <option value="name">名前順</option>
                <option value="status">未チェックイン優先</option>
                <option value="time">チェックイン時刻順</option>
              </select>

              {/* Toggle checked-in visibility */}
              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCheckedIn}
                  onChange={(e) => setShowCheckedIn(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-[#6EC6FF] focus:ring-[#6EC6FF]"
                />
                済みも表示
              </label>

              {/* Bulk actions */}
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={bulkCheckinAll}
                  disabled={checkedInCount === totalCount}
                  aria-label="全員をチェックインする"
                  className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                >
                  全員チェックイン
                </button>
                <button
                  onClick={resetAll}
                  disabled={checkedInCount === 0}
                  aria-label="チェックイン状態をリセット"
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 font-medium disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  リセット
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Participant list */}
        {totalCount === 0 ? (
          <Card>
            <div className="text-center py-8">
              <p className="text-4xl mb-3">👥</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                {events.length === 0
                  ? "イベントが登録されていません"
                  : "このイベントに参加者が登録されていません"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                「インポート」ページから参加者CSVをインポートしてください
              </p>
              {events.length > 0 && (
                <a
                  href="/admin/import"
                  className="inline-block mt-3 text-xs px-4 py-2 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors"
                >
                  インポートページへ
                </a>
              )}
            </div>
          </Card>
        ) : sorted.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
              検索条件に一致する参加者がいません
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {searchText ? `${sorted.length}件 / ${totalCount}件表示` : `${sorted.length}名の参加者`}
            </p>
            {sorted.map((p) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors ${
                  p.checkedIn
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-[#6EC6FF]"
                }`}
              >
                {/* Status icon */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${
                  p.checkedIn ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100 dark:bg-gray-700"
                }`}>
                  {p.checkedIn ? "✅" : "⬜"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm ${p.checkedIn ? "text-green-700 dark:text-green-400" : "text-gray-700 dark:text-gray-200"}`}>
                    {p.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                    {p.email && <span>{p.email}</span>}
                    {p.tags && p.tags.length > 0 && (
                      <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                        {p.tags.slice(0, 3).join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Check-in time */}
                {p.checkedIn && p.checkedInAt && (
                  <span className="text-xs text-green-500 font-mono flex-shrink-0">
                    {formatTime(p.checkedInAt)}
                  </span>
                )}

                {/* Action button */}
                <button
                  onClick={() => toggleCheckin(p.id)}
                  aria-label={p.checkedIn ? `${p.name}のチェックインを取り消す` : `${p.name}をチェックインする`}
                  className={`text-xs px-4 py-2 rounded-lg font-medium transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                    p.checkedIn
                      ? "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400"
                      : "bg-green-500 text-white hover:bg-green-600 shadow-sm"
                  }`}
                  data-testid={`checkin-btn-${p.id}`}
                >
                  {p.checkedIn ? "取消" : "チェックイン"}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

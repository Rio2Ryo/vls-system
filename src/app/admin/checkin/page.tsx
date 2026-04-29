"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import { EventData, Participant } from "@/lib/types";
import {
  getStoredEvents,
  getParticipantsForEvent,
  setStoredEvents,
} from "@/lib/store";
import { fireWebhook } from "@/lib/webhook";
import { csrfHeaders } from "@/lib/csrf";

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";
const APP_URL = typeof window !== "undefined" ? window.location.origin : "";

type Tab = "list" | "qr" | "walkin" | "registration";

export default function CheckinPage() {
  const { data: session, status } = useSession();
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [searchText, setSearchText] = useState("");
  const [toast, setToast] = useState("");
  const [showCheckedIn, setShowCheckedIn] = useState(true);
  const [sortKey, setSortKey] = useState<"name" | "time" | "status">("name");
  const [tab, setTab] = useState<Tab>("list");
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null);

  interface WalkInEntry {
    id: string;
    eventId: string;
    name: string;
    timestamp: number;
    matched: boolean;
    matchedParticipantId?: string;
    matchedParticipantName?: string;
  }
  const [walkInLog, setWalkInLog] = useState<WalkInEntry[]>([]);

  const tenantId = session?.user?.tenantId ?? (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ?? null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }, []);

  // Fetch participants directly from D1 (source of truth) — READ ONLY, no write-back
  const fetchParticipantsFromD1 = useCallback(async (eventId?: string) => {
    const eid = eventId || selectedEventId;
    if (!eid) { setParticipants([]); return; }
    try {
      const res = await fetch(`/api/db?key=vls_participants&_t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) {
        setParticipants(getParticipantsForEvent(eid));
        return;
      }
      const data = await res.json();
      if (data.value) {
        const all: Participant[] = JSON.parse(data.value);
        try { localStorage.setItem("vls_participants", data.value); } catch {}
        // Filter out any walkIn entries that might exist from old data
        setParticipants(all.filter((p) => p.eventId === eid && !(p as unknown as Record<string, unknown>).walkIn));
      }
    } catch {
      setParticipants(getParticipantsForEvent(eid));
    }
    // Also fetch walk-in log
    try {
      const logRes = await fetch(`/api/db?key=vls_walkin_log&_t=${Date.now()}`, { cache: "no-store" });
      if (logRes.ok) {
        const logData = await logRes.json();
        if (logData.value) {
          const allLog = JSON.parse(logData.value);
          setWalkInLog(allLog.filter((e: { eventId: string }) => e.eventId === eid));
        }
      }
    } catch { /* ignore */ }
  }, [selectedEventId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const allEvts = getStoredEvents();
    const evts = tenantId ? allEvts.filter((e) => e.tenantId === tenantId) : allEvts;
    setEvents(evts);
    if (evts.length > 0 && !selectedEventId) setSelectedEventId(evts[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tenantId]);

  // Poll D1 every 3 seconds + on focus
  useEffect(() => {
    if (!selectedEventId || status !== "authenticated") return;
    fetchParticipantsFromD1(selectedEventId);
    const interval = setInterval(() => fetchParticipantsFromD1(selectedEventId), 3000);
    const onFocus = () => fetchParticipantsFromD1(selectedEventId);
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [selectedEventId, status, fetchParticipantsFromD1]);

  // Write participants to D1 and refresh UI
  const writeParticipantsToD1 = async (updated: Participant[], toastMsg: string) => {
    const json = JSON.stringify(updated);
    try { localStorage.setItem("vls_participants", json); } catch {}
    setParticipants(updated.filter((p) => p.eventId === selectedEventId));
    showToast(toastMsg);
    // Write to D1 directly
    try {
      await fetch("/api/db", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ key: "vls_participants", value: json }),
      });
    } catch (err) {
      console.error("[checkin] D1 write failed:", err);
    }
    // Re-fetch from D1 to confirm
    fetchParticipantsFromD1(selectedEventId);
  };

  const toggleCheckin = (participantId: string) => {
    // Read from current state (which came from D1)
    const currentJson = localStorage.getItem("vls_participants");
    if (!currentJson) return;
    const allParticipants: Participant[] = JSON.parse(currentJson);
    const target = allParticipants.find((p) => p.id === participantId);
    if (!target) return;
    const now = Date.now();
    const updated = allParticipants.map((p) =>
      p.id === participantId
        ? { ...p, checkedIn: !p.checkedIn, checkedInAt: !p.checkedIn ? now : undefined }
        : p
    );
    const msg = !target.checkedIn
      ? `${target.name} をチェックインしました`
      : `${target.name} のチェックインを取り消しました`;
    writeParticipantsToD1(updated, msg);
    if (!target.checkedIn) {
      fireWebhook("checkin", { eventId: selectedEventId, participantName: target.name, participantEmail: target.email || undefined }, tenantId);
    }
  };

  const bulkCheckinAll = () => {
    const currentJson = localStorage.getItem("vls_participants");
    if (!currentJson) return;
    const allParticipants: Participant[] = JSON.parse(currentJson);
    const now = Date.now();
    const eventParticipantIds = new Set(participants.map((p) => p.id));
    const uncheckedCount = participants.filter((p) => !p.checkedIn).length;
    const updated = allParticipants.map((p) =>
      eventParticipantIds.has(p.id) && !p.checkedIn ? { ...p, checkedIn: true, checkedInAt: now } : p
    );
    writeParticipantsToD1(updated, `${uncheckedCount}名を一括チェックインしました`);
  };

  const resetAll = () => {
    const currentJson = localStorage.getItem("vls_participants");
    if (!currentJson) return;
    const allParticipants: Participant[] = JSON.parse(currentJson);
    const eventParticipantIds = new Set(participants.map((p) => p.id));
    const updated = allParticipants.map((p) =>
      eventParticipantIds.has(p.id) ? { ...p, checkedIn: false, checkedInAt: undefined } : p
    );
    writeParticipantsToD1(updated, "チェックイン状態をリセットしました");
  };

  const deleteParticipant = (participantId: string) => {
    const target = participants.find((p) => p.id === participantId);
    if (!target) return;
    if (!confirm(`「${target.name}」を参加者リストから削除しますか？\nこの操作は取り消せません。`)) return;
    const currentJson = localStorage.getItem("vls_participants");
    if (!currentJson) return;
    const allParticipants: Participant[] = JSON.parse(currentJson);
    const updated = allParticipants.filter((p) => p.id !== participantId);
    writeParticipantsToD1(updated, `${target.name} を削除しました`);
  };


  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">チェックイン画面を読み込み中...</p>
        </div>
      </main>
    );
  }

  const filtered = participants.filter((p) => {
    if (!showCheckedIn && p.checkedIn) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case "name": return a.name.localeCompare(b.name, "ja");
      case "time": return (b.checkedInAt || 0) - (a.checkedInAt || 0);
      case "status": return (a.checkedIn ? 1 : 0) - (b.checkedIn ? 1 : 0);
      default: return 0;
    }
  });

  const checkedInCount = participants.filter((p) => p.checkedIn).length;
  const totalCount = participants.length;
  const checkinRate = totalCount > 0 ? Math.round((checkedInCount / totalCount) * 100) : 0;
  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const formatTime = (ts?: number) => { if (!ts) return ""; const d = new Date(ts); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader title="チェックイン" badge={selectedEvent ? selectedEvent.name : undefined} onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }} />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="px-4 py-2 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm text-center" role="status" aria-live="polite">
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Event selector */}
        <Card>
          <label className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2 block">対象イベント</label>
          <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)} className={inputCls} data-testid="checkin-event-select">
            {events.length === 0 && <option value="">イベントなし</option>}
            {events.map((evt) => (<option key={evt.id} value={evt.id}>{evt.name} ({evt.date || "日付なし"})</option>))}
          </select>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="text-center"><p className="text-3xl font-bold text-blue-600">{totalCount}</p><p className="text-xs text-gray-400">参加者数</p></Card>
          <Card className="text-center"><p className="text-3xl font-bold text-green-600">{checkedInCount}</p><p className="text-xs text-gray-400">チェックイン済</p></Card>
          <Card className="text-center"><p className={`text-3xl font-bold ${checkinRate >= 80 ? "text-green-600" : checkinRate >= 50 ? "text-yellow-600" : "text-gray-500"}`}>{totalCount > 0 ? `${checkinRate}%` : "—"}</p><p className="text-xs text-gray-400">出席率</p></Card>
        </div>

        {totalCount > 0 && (
          <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden" role="progressbar" aria-valuenow={checkinRate} aria-valuemin={0} aria-valuemax={100}>
            <motion.div className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full" initial={{ width: 0 }} animate={{ width: `${checkinRate}%` }} transition={{ duration: 0.5 }} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setTab("list")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "list" ? "bg-green-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
            📋 参加者一覧
          </button>
          <button onClick={() => setTab("walkin")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "walkin" ? "bg-green-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
            🚶 来場記録 {walkInLog.length > 0 && <span className="ml-1 bg-white/30 px-1.5 py-0.5 rounded-full text-xs">{walkInLog.length}</span>}
          </button>
          <button onClick={() => setTab("qr")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "qr" ? "bg-green-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
            📱 イベントQRコード
          </button>
          <button onClick={() => setTab("registration")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "registration" ? "bg-green-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
            📝 申し込みフォーム
          </button>
        </div>

        {/* Walk-in log tab */}
        {tab === "walkin" && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-700 dark:text-gray-200">🚶 来場記録</h3>
              {walkInLog.length > 0 && (
                <button
                  onClick={async () => {
                    if (!confirm("この来場記録をすべて削除しますか？")) return;
                    // Read full log from D1, remove entries for this event, write back
                    try {
                      const logRes = await fetch(`/api/db?key=vls_walkin_log&_t=${Date.now()}`, { cache: "no-store" });
                      let allLog: WalkInEntry[] = [];
                      if (logRes.ok) {
                        const logData = await logRes.json();
                        if (logData.value) allLog = JSON.parse(logData.value);
                      }
                      const remaining = allLog.filter((e) => e.eventId !== selectedEventId);
                      await fetch("/api/db", {
                        method: "PUT",
                        headers: csrfHeaders({ "Content-Type": "application/json" }),
                        body: JSON.stringify({ key: "vls_walkin_log", value: JSON.stringify(remaining) }),
                      });
                      setWalkInLog([]);
                      showToast("来場記録をクリアしました");
                    } catch (err) {
                      console.error("[checkin] Failed to clear walk-in log:", err);
                      showToast("削除に失敗しました");
                    }
                  }}
                  className="text-xs text-red-400 hover:text-red-600 font-medium"
                >
                  すべてクリア
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-4">チェックインページから名前を入力した人の記録です。事前登録者との照合結果も表示されます。</p>
            {walkInLog.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">来場記録はまだありません</p>
            ) : (
              <div className="space-y-2">
                {[...walkInLog].sort((a, b) => b.timestamp - a.timestamp).map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                    <span className={`text-lg ${entry.matched ? "text-green-500" : "text-gray-400"}`}>{entry.matched ? "✅" : "🚶"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{entry.name}</p>
                      {entry.matched && entry.matchedParticipantName && (
                        <p className="text-xs text-green-600">→ 登録名「{entry.matchedParticipantName}」と一致</p>
                      )}
                      {!entry.matched && (
                        <p className="text-xs text-orange-500">事前登録との一致なし</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 font-mono flex-shrink-0">
                      {new Date(entry.timestamp).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          const logRes = await fetch(`/api/db?key=vls_walkin_log&_t=${Date.now()}`, { cache: "no-store" });
                          let allLog: WalkInEntry[] = [];
                          if (logRes.ok) {
                            const logData = await logRes.json();
                            if (logData.value) allLog = JSON.parse(logData.value);
                          }
                          const remaining = allLog.filter((e) => e.id !== entry.id);
                          await fetch("/api/db", {
                            method: "PUT",
                            headers: csrfHeaders({ "Content-Type": "application/json" }),
                            body: JSON.stringify({ key: "vls_walkin_log", value: JSON.stringify(remaining) }),
                          });
                          setWalkInLog((prev) => prev.filter((e) => e.id !== entry.id));
                          showToast(`${entry.name} を削除しました`);
                        } catch (err) {
                          console.error("[checkin] Failed to delete walk-in entry:", err);
                          showToast("削除に失敗しました");
                        }
                      }}
                      className="text-red-400 hover:text-red-600 flex-shrink-0 ml-1"
                      title="この記録を削除"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* QR tab — event checkin QR */}
        {tab === "qr" && (
          <Card>
            <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">🎫 イベントチェックインQRコード</h3>
            <p className="text-xs text-gray-500 mb-4">
              このQRコードを会場に掲示してください。参加者が自分のスマホで読み取り、名前を入力するとチェックインできます。
            </p>
            <div className="flex flex-col items-center gap-4">
              {/* QR Code display */}
              <div className="bg-white p-4 rounded-2xl shadow-md border-2 border-emerald-200">
                <div id="event-qr-code" className="w-64 h-64 flex items-center justify-center">
                  <p className="text-sm text-gray-400">QRコード読み込み中...</p>
                </div>
              </div>
              {/* URL display */}
              <div className="w-full max-w-md">
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg border flex-1 truncate">
                    {APP_URL}/event-checkin/{selectedEventId}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(`${APP_URL}/event-checkin/${selectedEventId}`); showToast("URLをコピーしました"); }}
                    className="text-xs px-3 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 font-medium flex-shrink-0"
                  >
                    コピー
                  </button>
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    try {
                      const QRCode = (await import("qrcode")).default;
                      const { jsPDF } = await import("jspdf");
                      const url = `${APP_URL}/event-checkin/${selectedEventId}`;
                      const eventName = events.find((e) => e.id === selectedEventId)?.name || "";
                      const qrDataUrl = await QRCode.toDataURL(url, { width: 600, margin: 2 });
                      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

                      // Title
                      doc.setFontSize(24);
                      doc.setTextColor(30);
                      doc.text(eventName || "チェックイン", 105, 40, { align: "center" });

                      // Subtitle
                      doc.setFontSize(14);
                      doc.setTextColor(100);
                      doc.text("QRコードを読み取ってチェックインしてください", 105, 55, { align: "center" });

                      // QR code (centered, large)
                      doc.addImage(qrDataUrl, "PNG", 30, 70, 150, 150);

                      // URL below
                      doc.setFontSize(8);
                      doc.setTextColor(150);
                      doc.text(url, 105, 230, { align: "center" });

                      doc.save(`checkin-qr-${eventName || "event"}.pdf`);
                      showToast("QRコードPDFを生成しました");
                    } catch (err) {
                      console.error("PDF error:", err);
                      showToast("PDF生成に失敗しました");
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 text-sm font-medium"
                >
                  📄 PDF印刷用に出力
                </button>
              </div>
            </div>

            {/* QR code render script */}
            <QrRenderer url={`${APP_URL}/event-checkin/${selectedEventId}`} />
          </Card>
        )}

        {/* List tab */}
        {tab === "list" && totalCount > 0 && (
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <input className={inputCls + " pl-8"} placeholder="名前・メールで検索" value={searchText} onChange={(e) => setSearchText(e.target.value)} aria-label="参加者を検索" />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
              </div>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as "name" | "time" | "status")} aria-label="並び替え"
                className="text-xs px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:outline-none bg-white dark:bg-gray-700 dark:text-gray-200">
                <option value="name">名前順</option><option value="status">未チェックイン優先</option><option value="time">チェックイン時刻順</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={showCheckedIn} onChange={(e) => setShowCheckedIn(e.target.checked)} className="rounded border-gray-300" />済みも表示
              </label>
              <div className="flex gap-2 ml-auto">
                <button onClick={bulkCheckinAll} disabled={checkedInCount === totalCount} className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium disabled:opacity-50">全員チェックイン</button>
                <button onClick={resetAll} disabled={checkedInCount === 0} className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 font-medium disabled:opacity-50">リセット</button>
              </div>
            </div>
          </Card>
        )}

        {tab === "list" && (totalCount === 0 ? (
          <Card>
            <div className="text-center py-8">
              <p className="text-4xl mb-3">👥</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{events.length === 0 ? "イベントが登録されていません" : "このイベントに参加者が登録されていません"}</p>
              <p className="text-xs text-gray-400">「インポート」ページから参加者CSVをインポートしてください</p>
            </div>
          </Card>
        ) : sorted.length === 0 ? (
          <Card><p className="text-sm text-gray-400 text-center py-6">検索条件に一致する参加者がいません</p></Card>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">{searchText ? `${sorted.length}件 / ${totalCount}件表示` : `${sorted.length}名の参加者`}</p>
            {sorted.map((p) => {
              const selectedEvent = events.find((e) => e.id === selectedEventId);
              const regFields = selectedEvent?.registrationFields || [];
              const hasDetails = p.phone || p.source || (p.customFields && Object.keys(p.customFields).length > 0);
              return (
              <motion.div key={p.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl border transition-colors ${p.checkedIn ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-[#6EC6FF]"}`}>
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${p.checkedIn ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100 dark:bg-gray-700"}`}>
                    {p.checkedIn ? "✅" : "⬜"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-sm ${p.checkedIn ? "text-green-700 dark:text-green-400" : "text-gray-700 dark:text-gray-200"}`}>{p.name}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                      {p.email && <span>{p.email}</span>}
                      {p.phone && <span>📞 {p.phone}</span>}
                      {p.source === "form" && <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[10px]">フォーム</span>}
                    </div>
                  </div>
                  {p.checkedIn && p.checkedInAt && <span className="text-xs text-green-500 font-mono flex-shrink-0">{formatTime(p.checkedInAt)}</span>}
                  {hasDetails && (
                    <button
                      onClick={() => setExpandedParticipant(expandedParticipant === p.id ? null : p.id)}
                      className="text-xs px-2 py-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                      title="詳細を表示"
                    >
                      {expandedParticipant === p.id ? "▲" : "▼"}
                    </button>
                  )}
                  <button onClick={() => toggleCheckin(p.id)}
                    className={`text-xs px-4 py-2 rounded-lg font-medium transition-colors flex-shrink-0 ${p.checkedIn ? "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-red-100 hover:text-red-600" : "bg-green-500 text-white hover:bg-green-600 shadow-sm"}`}>
                    {p.checkedIn ? "取消" : "チェックイン"}
                  </button>
                  <button onClick={() => deleteParticipant(p.id)}
                    className="text-xs px-2 py-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                    title="参加者を削除">
                    🗑
                  </button>
                </div>
                {/* Expanded detail panel */}
                <AnimatePresence>
                  {expandedParticipant === p.id && hasDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          {p.phone && (
                            <div className="flex gap-2">
                              <span className="text-gray-400 flex-shrink-0">📞 電話番号:</span>
                              <span className="text-gray-700 dark:text-gray-300">{p.phone}</span>
                            </div>
                          )}
                          {p.source && (
                            <div className="flex gap-2">
                              <span className="text-gray-400 flex-shrink-0">📋 登録元:</span>
                              <span className="text-gray-700 dark:text-gray-300">{p.source === "form" ? "申し込みフォーム" : "CSVインポート"}</span>
                            </div>
                          )}
                          {p.customFields && Object.entries(p.customFields).map(([fieldId, value]) => {
                            const fieldDef = regFields.find((f) => f.id === fieldId);
                            const label = fieldDef?.label || fieldId;
                            return (
                              <div key={fieldId} className="flex gap-2">
                                <span className="text-gray-400 flex-shrink-0">{label}:</span>
                                <span className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{value === "true" ? "✅ 同意" : value}</span>
                              </div>
                            );
                          })}
                          {p.registeredAt && (
                            <div className="flex gap-2">
                              <span className="text-gray-400 flex-shrink-0">📅 登録日時:</span>
                              <span className="text-gray-700 dark:text-gray-300">{new Date(p.registeredAt).toLocaleString("ja-JP")}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
              );
            })}
          </div>
        ))}

        {/* Registration form settings tab */}
        {tab === "registration" && (
          <RegistrationTab
            selectedEventId={selectedEventId}
            events={events}
            setEvents={setEvents}
            participantCount={totalCount}
            showToast={showToast}
          />
        )}
      </div>
    </main>
  );
}

/** Renders a QR code into #event-qr-code container */
function QrRenderer({ url }: { url: string }) {
  useEffect(() => {
    const container = document.getElementById("event-qr-code");
    if (!container || !url) return;

    import("qrcode").then(({ default: QRCode }) => {
      const canvas = document.createElement("canvas");
      QRCode.toCanvas(canvas, url, { width: 256, margin: 2 }, (err) => {
        if (err) {
          container.innerHTML = '<p class="text-red-400 text-sm">QR生成エラー</p>';
          return;
        }
        container.innerHTML = "";
        container.appendChild(canvas);
      });
    }).catch(() => {
      if (container) container.innerHTML = '<p class="text-red-400 text-sm">QRライブラリ読み込みエラー</p>';
    });
  }, [url]);

  return null;
}

/** Registration form settings tab */
function RegistrationTab({
  selectedEventId,
  events,
  setEvents,
  participantCount,
  showToast,
}: {
  selectedEventId: string;
  events: EventData[];
  setEvents: (e: EventData[]) => void;
  participantCount: number;
  showToast: (msg: string) => void;
}) {
  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const [saving, setSaving] = useState(false);

  // Local state for form fields
  const [regOpen, setRegOpen] = useState(selectedEvent?.registrationOpen ?? false);
  const [deadline, setDeadline] = useState(selectedEvent?.registrationDeadline ?? "");
  const [maxP, setMaxP] = useState(selectedEvent?.maxParticipants ?? 0);
  const [formTitle, setFormTitle] = useState(selectedEvent?.registrationFormTitle ?? "");
  const [description, setDescription] = useState(selectedEvent?.registrationDescription ?? "");
  const [customFields, setCustomFields] = useState<import("@/lib/types").RegistrationField[]>(
    selectedEvent?.registrationFields ?? []
  );

  // Sync when event changes
  useEffect(() => {
    setRegOpen(selectedEvent?.registrationOpen ?? false);
    setDeadline(selectedEvent?.registrationDeadline ?? "");
    setMaxP(selectedEvent?.maxParticipants ?? 0);
    setFormTitle(selectedEvent?.registrationFormTitle ?? "");
    setDescription(selectedEvent?.registrationDescription ?? "");
    setCustomFields(selectedEvent?.registrationFields ?? []);
  }, [selectedEvent]);

  const saveSettings = async () => {
    if (!selectedEvent) return;
    setSaving(true);
    try {
      const updatedEvents = events.map((e) =>
        e.id === selectedEventId
          ? {
              ...e,
              registrationOpen: regOpen,
              registrationDeadline: deadline || undefined,
              maxParticipants: maxP || undefined,
              registrationFormTitle: formTitle || undefined,
              registrationDescription: description || undefined,
              registrationFields: customFields.length > 0 ? customFields : undefined,
            }
          : e
      );
      setStoredEvents(updatedEvents);
      setEvents(updatedEvents);

      try {
        localStorage.setItem("vls_admin_events", JSON.stringify(updatedEvents));
      } catch { /* ignore */ }
      await fetch("/api/db", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ key: "vls_admin_events", value: JSON.stringify(updatedEvents) }),
      });

      showToast("申し込みフォーム設定を保存しました");
    } catch (err) {
      console.error("[registration] Save failed:", err);
      showToast("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  // --- Custom field CRUD ---
  const addField = (type: import("@/lib/types").RegistrationFieldType) => {
    const id = `cf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const defaults: Record<string, Partial<import("@/lib/types").RegistrationField>> = {
      name: { label: "お名前", required: true },
      email: { label: "メールアドレス", required: true },
      phone: { label: "電話番号", required: false },
      text: { label: "新しいテキスト項目", required: false },
      textarea: { label: "自由記入欄", required: false },
      radio: { label: "選択項目", required: false, options: ["選択肢1", "選択肢2"] },
      checkbox: { label: "同意確認", required: true, description: "上記の内容に同意します" },
    };
    const d = defaults[type] || {};
    setCustomFields([...customFields, { id, type, label: d.label || "", required: d.required ?? false, options: d.options, description: d.description }]);
  };

  const updateField = (id: string, updates: Partial<import("@/lib/types").RegistrationField>) => {
    setCustomFields(customFields.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const removeField = (id: string) => {
    setCustomFields(customFields.filter((f) => f.id !== id));
  };

  const moveField = (id: string, dir: -1 | 1) => {
    const idx = customFields.findIndex((f) => f.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= customFields.length) return;
    const arr = [...customFields];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setCustomFields(arr);
  };

  const registrationUrl = `${APP_URL}/register/${selectedEventId}`;

  if (!selectedEvent) {
    return (
      <Card>
        <p className="text-sm text-gray-400 text-center py-8">イベントを選択してください</p>
      </Card>
    );
  }

  return (
    <>
      {/* Basic settings */}
      <Card>
        <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">📝 申し込みフォーム設定</h3>
        <div className="space-y-5">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">申し込み受付</p>
              <p className="text-xs text-gray-400">ONにするとフォームが公開されます</p>
            </div>
            <button
              onClick={() => setRegOpen(!regOpen)}
              className={`relative w-14 h-7 rounded-full transition-colors ${regOpen ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${regOpen ? "translate-x-7" : ""}`} />
            </button>
          </div>

          {/* Status indicator */}
          <div className={`px-4 py-3 rounded-xl border ${regOpen ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"}`}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${regOpen ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
              <span className={`text-sm font-medium ${regOpen ? "text-green-700 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}`}>
                {regOpen ? "受付中" : "受付停止中"}
              </span>
            </div>
            {regOpen && (
              <p className="text-xs text-green-600 dark:text-green-500 mt-1 ml-5">
                現在の申し込み: {participantCount}名
                {maxP > 0 && ` / 定員${maxP}名`}
              </p>
            )}
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">受付締切日</label>
            <p className="text-xs text-gray-400 mb-2">この日の23:59まで受付（空欄 = 手動で閉じるまで受付）</p>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-emerald-500 focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
          </div>

          {/* Max participants */}
          <div>
            {/* Form title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">フォームタイトル</label>
            <p className="text-xs text-gray-400 mb-2">空欄 = 「イベント申し込み」</p>
            <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
              placeholder="イベント申し込み"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-emerald-500 focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
          </div>

          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">定員</label>
            <p className="text-xs text-gray-400 mb-2">0 = 無制限</p>
            <input type="number" min={0} value={maxP} onChange={(e) => setMaxP(parseInt(e.target.value) || 0)}
              className="w-32 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-emerald-500 focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100" placeholder="0" />
            <span className="text-xs text-gray-500 ml-2">名</span>
          </div>
        </div>
      </Card>

      {/* Description editor */}
      <Card>
        <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">📄 イベント概要</h3>
        <p className="text-xs text-gray-500 mb-3">フォーム上部に表示される概要テキスト。日時・場所・内容・注意事項などを自由に記載できます。</p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
          placeholder={"日時：1月24日（土）13:30-16:00　受付 13:15〜\n場所：○○小学校 体育館\n対象：小学1〜6年生\n参加費：無料\n\nプログラム内容：\n1部　かけっこ教室\n2部　スポーツ体験\n\n問い合わせ先：イベント事務局 info@example.com"}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-emerald-500 focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100 resize-y font-sans"
        />
        {description && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-1">プレビュー：</p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {description}
            </div>
          </div>
        )}
      </Card>

      {/* Custom fields editor */}
      <Card>
        <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">🔧 フォーム入力項目</h3>
        <p className="text-xs text-gray-500 mb-4">フォームに表示する入力項目を自由に設定できます。「お名前」「メールアドレス」は必須です。</p>

        {customFields.length > 0 && (
          <div className="space-y-3 mb-4">
            {customFields.map((field, idx) => (
              <div key={field.id} className="border border-gray-200 dark:border-gray-600 rounded-xl p-4 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-start gap-2 mb-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono flex-shrink-0 ${["name","email","phone"].includes(field.type) ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"}`}>
                    {field.type === "name" ? "👤 お名前" : field.type === "email" ? "✉️ メール" : field.type === "phone" ? "📞 電話番号" : field.type === "text" ? "📝 テキスト" : field.type === "textarea" ? "📝 自由記入" : field.type === "radio" ? "🔘 選択" : "☑️ 同意"}
                  </span>
                  <div className="flex gap-1 ml-auto">
                    <button onClick={() => moveField(field.id, -1)} disabled={idx === 0}
                      className="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 hover:bg-gray-300 disabled:opacity-30">↑</button>
                    <button onClick={() => moveField(field.id, 1)} disabled={idx === customFields.length - 1}
                      className="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 hover:bg-gray-300 disabled:opacity-30">↓</button>
                    <button onClick={() => removeField(field.id)}
                      className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-500 hover:bg-red-200">✕</button>
                  </div>
                </div>

                {/* Label */}
                <div className="mb-2">
                  <label className="text-xs text-gray-500 mb-0.5 block">ラベル</label>
                  <input type="text" value={field.label} onChange={(e) => updateField(field.id, { label: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:border-emerald-500"
                    placeholder="項目のラベル" />
                </div>

                {/* Description */}
                <div className="mb-2">
                  <label className="text-xs text-gray-500 mb-0.5 block">補足説明（任意）</label>
                  <input type="text" value={field.description || ""} onChange={(e) => updateField(field.id, { description: e.target.value || undefined })}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:border-emerald-500"
                    placeholder="補足テキスト" />
                </div>

                {/* Required toggle */}
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" checked={field.required} onChange={(e) => updateField(field.id, { required: e.target.checked })}
                    className="rounded border-gray-300" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">必須項目</span>
                </label>

                {/* Radio options editor */}
                {field.type === "radio" && (
                  <div className="mt-2">
                    <label className="text-xs text-gray-500 mb-1 block">選択肢</label>
                    <div className="space-y-1.5">
                      {(field.options || []).map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400 w-4">{optIdx + 1}.</span>
                          <input type="text" value={opt}
                            onChange={(e) => {
                              const newOpts = [...(field.options || [])];
                              newOpts[optIdx] = e.target.value;
                              updateField(field.id, { options: newOpts });
                            }}
                            className="flex-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:border-emerald-500" />
                          <button onClick={() => {
                            const newOpts = (field.options || []).filter((_, i) => i !== optIdx);
                            updateField(field.id, { options: newOpts });
                          }} className="text-xs text-red-400 hover:text-red-600 px-1">✕</button>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => updateField(field.id, { options: [...(field.options || []), `選択肢${(field.options?.length || 0) + 1}`] })}
                      className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                      ＋ 選択肢を追加
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add system field buttons */}
        <p className="text-xs text-gray-500 mb-2 font-medium">システム項目：</p>
        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={() => addField("name")}
            className="text-xs px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 font-medium border border-blue-200 dark:border-blue-800">
            ＋ お名前
          </button>
          <button onClick={() => addField("email")}
            className="text-xs px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 font-medium border border-blue-200 dark:border-blue-800">
            ＋ メールアドレス
          </button>
          <button onClick={() => addField("phone")}
            className="text-xs px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 font-medium border border-blue-200 dark:border-blue-800">
            ＋ 電話番号
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-2 font-medium">カスタム項目：</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => addField("text")}
            className="text-xs px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 font-medium border border-emerald-200 dark:border-emerald-800">
            ＋ テキスト入力
          </button>
          <button onClick={() => addField("textarea")}
            className="text-xs px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 font-medium border border-purple-200 dark:border-purple-800">
            ＋ 自由記入欄
          </button>
          <button onClick={() => addField("radio")}
            className="text-xs px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 font-medium border border-amber-200 dark:border-amber-800">
            ＋ 選択肢（ラジオ）
          </button>
          <button onClick={() => addField("checkbox")}
            className="text-xs px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 font-medium border border-green-200 dark:border-green-800">
            ＋ 同意チェック
          </button>
        </div>
      </Card>

      {/* Save button */}
      <Card>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="w-full px-6 py-3 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 font-bold text-base transition-colors disabled:opacity-50"
        >
          {saving ? "保存中..." : "💾 設定をすべて保存"}
        </button>
      </Card>

      {/* URL & QR */}
      <Card>
        <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">🔗 申し込みフォームURL</h3>
        <p className="text-xs text-gray-500 mb-4">このURLまたはQRコードを共有して、参加者に事前申し込みしてもらいます。</p>
        <div className="flex flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-md border-2 border-emerald-200">
            <div id="registration-qr-code" className="w-64 h-64 flex items-center justify-center">
              <p className="text-sm text-gray-400">QRコード読み込み中...</p>
            </div>
          </div>
          <div className="w-full max-w-md">
            <div className="flex items-center gap-2">
              <code className="text-xs bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg border flex-1 truncate">{registrationUrl}</code>
              <button onClick={() => { navigator.clipboard.writeText(registrationUrl); showToast("URLをコピーしました"); }}
                className="text-xs px-3 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 font-medium flex-shrink-0">コピー</button>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                try {
                  const QRCode = (await import("qrcode")).default;
                  const { jsPDF } = await import("jspdf");
                  const qrDataUrl = await QRCode.toDataURL(registrationUrl, { width: 600, margin: 2 });
                  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                  const eventName = selectedEvent?.name || "";
                  doc.setFontSize(24);
                  doc.setTextColor(30);
                  doc.text(eventName || "イベント申し込み", 105, 40, { align: "center" });
                  doc.setFontSize(14);
                  doc.setTextColor(100);
                  doc.text("QRコードを読み取って申し込みしてください", 105, 55, { align: "center" });
                  doc.addImage(qrDataUrl, "PNG", 30, 70, 150, 150);
                  doc.setFontSize(8);
                  doc.setTextColor(150);
                  doc.text(registrationUrl, 105, 230, { align: "center" });
                  doc.save(`registration-qr-${eventName || "event"}.pdf`);
                  showToast("QRコードPDFを生成しました");
                } catch (err) {
                  console.error("PDF error:", err);
                  showToast("PDF生成に失敗しました");
                }
              }}
              className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 text-sm font-medium">📄 PDF印刷用に出力</button>
            <a href={registrationUrl} target="_blank" rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 text-sm font-medium">🔗 フォームを開く</a>
          </div>
        </div>
        <RegistrationQrRenderer url={registrationUrl} />
      </Card>
    </>
  );
}

/** Renders QR code for registration form */
function RegistrationQrRenderer({ url }: { url: string }) {
  useEffect(() => {
    const container = document.getElementById("registration-qr-code");
    if (!container || !url) return;

    import("qrcode").then(({ default: QRCode }) => {
      const canvas = document.createElement("canvas");
      QRCode.toCanvas(canvas, url, { width: 256, margin: 2 }, (err) => {
        if (err) {
          container.innerHTML = '<p class="text-red-400 text-sm">QR生成エラー</p>';
          return;
        }
        container.innerHTML = "";
        container.appendChild(canvas);
      });
    }).catch(() => {
      if (container) container.innerHTML = '<p class="text-red-400 text-sm">QRライブラリ読み込みエラー</p>';
    });
  }, [url]);

  return null;
}


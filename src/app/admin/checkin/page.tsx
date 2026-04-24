"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import AdminHeader from "@/components/admin/AdminHeader";
import { EventData, Participant } from "@/lib/types";
import {
  getStoredEvents,
  getStoredParticipants,
  setStoredParticipants,
  getParticipantsForEvent,
} from "@/lib/store";
import { fireWebhook } from "@/lib/webhook";
import { csrfHeaders } from "@/lib/csrf";

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";
const APP_URL = typeof window !== "undefined" ? window.location.origin : "";

type Tab = "list" | "qr";

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
  const [qrGenerating, setQrGenerating] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

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
      // Cache-busting: timestamp prevents browser/CDN caching
      const res = await fetch(`/api/db?key=vls_participants&_t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) {
        setParticipants(getParticipantsForEvent(eid));
        return;
      }
      const data = await res.json();
      if (data.value) {
        const all: Participant[] = JSON.parse(data.value);
        try { localStorage.setItem("vls_participants", data.value); } catch {}
        setParticipants(all.filter((p) => p.eventId === eid));
      }
    } catch {
      setParticipants(getParticipantsForEvent(eid));
    }
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

  // Generate PDF with QR codes
  const generateQrPdf = async () => {
    setQrGenerating(true);
    try {
      const QRCode = (await import("qrcode")).default;
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const eventName = events.find((e) => e.id === selectedEventId)?.name || "";
      const cols = 2, rows = 4;
      const cardW = 85, cardH = 60;
      const marginX = (210 - cols * cardW) / (cols + 1);
      const marginY = (297 - rows * cardH) / (rows + 1);

      for (let i = 0; i < participants.length; i++) {
        const p = participants[i];
        if (!p.checkinToken) continue;
        const _page = Math.floor(i / (cols * rows)); void _page;
        const posOnPage = i % (cols * rows);
        if (posOnPage === 0 && i > 0) doc.addPage();
        const col = posOnPage % cols;
        const row = Math.floor(posOnPage / cols);
        const x = marginX + col * (cardW + marginX);
        const y = marginY + row * (cardH + marginY);

        // Card border
        doc.setDrawColor(200);
        doc.roundedRect(x, y, cardW, cardH, 3, 3);

        // QR code
        const url = `${APP_URL}/checkin/${p.checkinToken}`;
        const qrDataUrl = await QRCode.toDataURL(url, { width: 160, margin: 1 });
        doc.addImage(qrDataUrl, "PNG", x + 3, y + 3, 30, 30);

        // Name & event
        doc.setFontSize(12);
        doc.setTextColor(30);
        doc.text(p.name, x + 38, y + 14);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(eventName, x + 38, y + 20);
        if (p.email) {
          doc.setFontSize(7);
          doc.text(p.email, x + 38, y + 26);
        }
        // Token
        doc.setFontSize(6);
        doc.setTextColor(180);
        doc.text(`ID: ${p.checkinToken}`, x + 3, y + cardH - 3);
      }

      doc.save(`checkin-qr-${eventName || "event"}.pdf`);
      showToast("QRコードPDFを生成しました");
    } catch (err) {
      console.error("PDF generation error:", err);
      showToast("PDF生成に失敗しました");
    }
    setQrGenerating(false);
  };

  // Send QR via email
  const sendQrEmails = async () => {
    const withEmail = participants.filter((p) => p.email && p.checkinToken);
    if (withEmail.length === 0) { showToast("メールアドレスのある参加者がいません"); return; }
    setEmailSending(true);
    let sent = 0;
    for (const p of withEmail) {
      try {
        const res = await fetch("/api/send-checkin-qr", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            email: p.email,
            name: p.name,
            token: p.checkinToken,
            eventName: events.find((e) => e.id === selectedEventId)?.name || "",
          }),
        });
        if (res.ok) sent++;
      } catch { /* ignore */ }
    }
    setEmailSending(false);
    showToast(`${sent}/${withEmail.length}名にQRコードメールを送信しました`);
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
        <div className="flex gap-2">
          <button onClick={() => setTab("list")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "list" ? "bg-green-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
            📋 参加者一覧
          </button>
          <button onClick={() => setTab("qr")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "qr" ? "bg-green-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
            📱 QRコード配布
          </button>
        </div>

        {/* QR tab */}
        {tab === "qr" && (
          <Card>
            <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">個人QRコード配布</h3>
            <p className="text-xs text-gray-500 mb-4">各参加者にユニークなQRコードを配布します。QRをスキャンするだけでチェックインが完了します。</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <h4 className="font-medium text-sm text-gray-700 dark:text-gray-200 mb-2">📄 PDF一括生成</h4>
                <p className="text-xs text-gray-500 mb-3">名前入りQRカードをPDFで生成します。印刷して名札に貼り付けられます。</p>
                <Button size="sm" onClick={generateQrPdf} disabled={qrGenerating || totalCount === 0}>
                  {qrGenerating ? "生成中..." : `QRコードPDF生成 (${totalCount}名)`}
                </Button>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <h4 className="font-medium text-sm text-gray-700 dark:text-gray-200 mb-2">✉️ メール一括送信</h4>
                <p className="text-xs text-gray-500 mb-3">メールアドレスが登録されている参加者にQRコード付きメールを送信します。</p>
                <Button size="sm" onClick={sendQrEmails} disabled={emailSending || participants.filter((p) => p.email).length === 0}>
                  {emailSending ? "送信中..." : `QRメール送信 (${participants.filter((p) => p.email).length}名)`}
                </Button>
              </div>
            </div>
            {/* Kiosk link */}
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <h4 className="font-medium text-sm text-blue-700 dark:text-blue-300 mb-1">📱 キオスクスキャナー</h4>
              <p className="text-xs text-gray-500 mb-2">会場の端末でこのURLを開き、参加者のQRコードを読み取ってチェックインします。</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border flex-1 truncate">{APP_URL}/scan</code>
                <button onClick={() => { navigator.clipboard.writeText(`${APP_URL}/scan`); showToast("URLをコピーしました"); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 font-medium flex-shrink-0">コピー</button>
              </div>
            </div>
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
            {sorted.map((p) => (
              <motion.div key={p.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className={`flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors ${p.checkedIn ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-[#6EC6FF]"}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${p.checkedIn ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100 dark:bg-gray-700"}`}>
                  {p.checkedIn ? "✅" : "⬜"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm ${p.checkedIn ? "text-green-700 dark:text-green-400" : "text-gray-700 dark:text-gray-200"}`}>{p.name}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {p.email && <span>{p.email}</span>}
                    {p.checkinToken && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">{p.checkinToken}</span>}
                  </div>
                </div>
                {p.checkedIn && p.checkedInAt && <span className="text-xs text-green-500 font-mono flex-shrink-0">{formatTime(p.checkedInAt)}</span>}
                <button onClick={() => toggleCheckin(p.id)}
                  className={`text-xs px-4 py-2 rounded-lg font-medium transition-colors flex-shrink-0 ${p.checkedIn ? "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-red-100 hover:text-red-600" : "bg-green-500 text-white hover:bg-green-600 shadow-sm"}`}>
                  {p.checkedIn ? "取消" : "チェックイン"}
                </button>
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import {
  getEventByPassword,
  getEventBySlug,
  getStoredEvents,
  getStoredParticipants,
  setStoredParticipants,
  getParticipantsForEvent,
} from "@/lib/store";
import { EventData, Participant } from "@/lib/types";

type Phase = "scanner" | "event-found" | "checkin" | "done";

export default function ScanPage() {
  const [phase, setPhase] = useState<Phase>("scanner");
  const [event, setEvent] = useState<EventData | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [searchText, setSearchText] = useState("");
  const [toast, setToast] = useState("");
  const [checkedParticipant, setCheckedParticipant] = useState<Participant | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);

  // Manual event selection fallback
  const [manualMode, setManualMode] = useState(false);
  const [allEvents, setAllEvents] = useState<EventData[]>([]);

  useEffect(() => {
    setAllEvents(getStoredEvents());
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  // Parse QR content → find event
  const handleQrResult = useCallback(
    (text: string) => {
      if (event) return; // already matched

      let found: EventData | null = null;

      // Try: URL with ?pw=PASSWORD
      try {
        const url = new URL(text, "https://placeholder.com");
        const pw = url.searchParams.get("pw");
        if (pw) found = getEventByPassword(pw);

        // Try: /e/[slug] path
        if (!found) {
          const slugMatch = url.pathname.match(/^\/e\/([^/]+)/);
          if (slugMatch) found = getEventBySlug(slugMatch[1]);
        }
      } catch {
        // Not a URL — try as raw password
      }

      // Try raw text as password
      if (!found) found = getEventByPassword(text);

      // Try raw text as slug
      if (!found) found = getEventBySlug(text);

      if (found) {
        setEvent(found);
        setParticipants(getParticipantsForEvent(found.id));
        setPhase("event-found");
        stopScanner();
      } else {
        showToast("対応するイベントが見つかりません");
      }
    },
    [event, showToast]
  );

  // Start camera scanner
  const startScanner = useCallback(async () => {
    setCameraError("");
    setScanning(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scannerId = "qr-reader";

      // Ensure element exists
      if (!document.getElementById(scannerId)) {
        setCameraError("スキャナー要素が見つかりません");
        setScanning(false);
        return;
      }

      const scanner = new Html5Qrcode(scannerId);
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleQrResult(decodedText);
        },
        () => {
          // QR parse error (ignore — just means no QR in frame yet)
        }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setCameraError("カメラへのアクセスが許可されていません。ブラウザの設定を確認してください。");
      } else if (msg.includes("NotFoundError")) {
        setCameraError("カメラが見つかりません。カメラ付きデバイスで開いてください。");
      } else {
        setCameraError(`カメラエラー: ${msg}`);
      }
      setScanning(false);
    }
  }, [handleQrResult]);

  const stopScanner = useCallback(async () => {
    try {
      const scanner = html5QrRef.current as { stop?: () => Promise<void> } | null;
      if (scanner?.stop) await scanner.stop();
    } catch {
      // ignore
    }
    html5QrRef.current = null;
    setScanning(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  // Auto-start scanner on mount
  useEffect(() => {
    if (phase === "scanner" && !manualMode) {
      const timer = setTimeout(() => startScanner(), 500);
      return () => clearTimeout(timer);
    }
  }, [phase, manualMode, startScanner]);

  // Manual event selection
  const handleSelectEvent = (eventId: string) => {
    const found = allEvents.find((e) => e.id === eventId);
    if (found) {
      setEvent(found);
      setParticipants(getParticipantsForEvent(found.id));
      setPhase("event-found");
    }
  };

  // Check-in a participant
  const handleCheckin = (participant: Participant) => {
    const all = getStoredParticipants();
    const now = Date.now();
    const updated = all.map((p) =>
      p.id === participant.id ? { ...p, checkedIn: true, checkedInAt: now } : p
    );
    setStoredParticipants(updated);
    setCheckedParticipant({ ...participant, checkedIn: true, checkedInAt: now });
    setPhase("done");
    showToast(`${participant.name} をチェックインしました`);
  };

  // Reset for next scan
  const handleReset = () => {
    setEvent(null);
    setParticipants([]);
    setSearchText("");
    setCheckedParticipant(null);
    setPhase("scanner");
    setManualMode(false);
  };

  // Filter participants by search
  const filtered = participants.filter((p) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
  });

  // --- Renderers ---

  const renderScanner = () => (
    <div className="max-w-md mx-auto space-y-4">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <h1 className="text-xl font-bold text-gray-800">QRスキャン</h1>
        <p className="text-gray-400 text-sm mt-1">イベントのQRコードをスキャンしてください</p>
      </motion.div>

      {!manualMode ? (
        <>
          <Card>
            <div
              id="qr-reader"
              ref={scannerRef}
              className="w-full rounded-xl overflow-hidden bg-black min-h-[280px]"
            />
            {cameraError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 text-center">
                {cameraError}
              </div>
            )}
          </Card>

          <div className="text-center space-y-3">
            {!scanning && !cameraError && (
              <Button onClick={startScanner} size="md">
                カメラを起動
              </Button>
            )}
            <button
              onClick={() => {
                stopScanner();
                setManualMode(true);
              }}
              className="block mx-auto text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
            >
              QRなしでイベントを選択
            </button>
          </div>
        </>
      ) : (
        <Card>
          <h2 className="text-sm font-bold text-gray-600 mb-3">イベントを選択</h2>
          {allEvents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">イベントが登録されていません</p>
          ) : (
            <div className="space-y-2">
              {allEvents.map((evt) => (
                <button
                  key={evt.id}
                  onClick={() => handleSelectEvent(evt.id)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-[#6EC6FF] hover:bg-blue-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                >
                  <p className="font-medium text-sm text-gray-700">{evt.name}</p>
                  <p className="text-xs text-gray-400">{evt.date}</p>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setManualMode(false)}
            className="mt-3 block mx-auto text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
          >
            QRスキャンに戻る
          </button>
        </Card>
      )}
    </div>
  );

  const renderEventFound = () => {
    if (!event) return null;
    const checkedInCount = participants.filter((p) => p.checkedIn).length;

    return (
      <div className="max-w-md mx-auto space-y-4">
        <Card>
          <div className="text-center mb-4">
            <span className="text-3xl" aria-hidden="true">🎪</span>
            <h2 className="text-lg font-bold text-gray-800 mt-2">{event.name}</h2>
            <p className="text-xs text-gray-400">{event.date}</p>
            {participants.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {checkedInCount}/{participants.length}名 チェックイン済
              </p>
            )}
          </div>
          <Button onClick={() => setPhase("checkin")} size="lg" className="w-full">
            チェックインへ進む
          </Button>
        </Card>

        <button
          onClick={handleReset}
          className="block mx-auto text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
        >
          別のイベントをスキャン
        </button>
      </div>
    );
  };

  const renderCheckin = () => {
    if (!event) return null;

    return (
      <div className="max-w-md mx-auto space-y-4">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <h2 className="text-lg font-bold text-gray-800">{event.name}</h2>
          <p className="text-gray-400 text-sm">お名前を入力して検索</p>
        </motion.div>

        <Card>
          <div className="relative">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="お名前を入力..."
              aria-label="参加者名で検索"
              autoFocus
              className="w-full px-4 py-3 pl-9 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:ring-2 focus:ring-blue-100 focus:outline-none text-base bg-gray-50/50"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
              🔍
            </span>
          </div>
        </Card>

        {/* Participant list */}
        {participants.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-400 text-center py-6">
              このイベントに参加者が登録されていません
            </p>
          </Card>
        ) : filtered.length === 0 && searchText ? (
          <Card>
            <p className="text-sm text-gray-400 text-center py-6">
              「{searchText}」に一致する参加者がいません
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.slice(0, 20).map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  p.checkedIn
                    ? "bg-green-50 border-green-200"
                    : "bg-white border-gray-200 hover:border-[#6EC6FF]"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                    p.checkedIn ? "bg-green-100" : "bg-gray-100"
                  }`}
                >
                  {p.checkedIn ? "✅" : "👤"}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm ${p.checkedIn ? "text-green-700" : "text-gray-700"}`}>
                    {p.name}
                  </p>
                  {p.email && <p className="text-xs text-gray-400 truncate">{p.email}</p>}
                </div>

                {p.checkedIn ? (
                  <span className="text-xs text-green-500 font-medium flex-shrink-0">済</span>
                ) : (
                  <button
                    onClick={() => handleCheckin(p)}
                    aria-label={`${p.name}をチェックインする`}
                    className="text-xs px-4 py-2 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                  >
                    チェックイン
                  </button>
                )}
              </motion.div>
            ))}
            {filtered.length > 20 && (
              <p className="text-xs text-gray-400 text-center">
                さらに{filtered.length - 20}名...（検索で絞り込んでください）
              </p>
            )}
          </div>
        )}

        <button
          onClick={() => setPhase("event-found")}
          className="block mx-auto text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
        >
          戻る
        </button>
      </div>
    );
  };

  const renderDone = () => (
    <div className="max-w-md mx-auto space-y-4">
      <Card className="text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.5 }}
        >
          <span className="text-5xl block mb-3">✅</span>
          <h2 className="text-xl font-bold text-green-700">チェックイン完了</h2>
          {checkedParticipant && (
            <p className="text-gray-600 mt-2 text-lg font-medium">{checkedParticipant.name}</p>
          )}
          {event && <p className="text-xs text-gray-400 mt-1">{event.name}</p>}
        </motion.div>
      </Card>

      <div className="flex gap-3">
        <Button onClick={() => { setCheckedParticipant(null); setPhase("checkin"); }} variant="secondary" size="md" className="flex-1">
          続けてチェックイン
        </Button>
        <Button onClick={handleReset} variant="ghost" size="md" className="flex-1">
          別イベントをスキャン
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-green-600 to-teal-600 text-white px-4 py-3 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">📱</span>
            <span className="text-sm font-bold">QRチェックイン</span>
          </div>
          {event && (
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{event.name}</span>
          )}
        </div>
      </div>

      <main className="min-h-screen bg-gray-50 p-4 pt-6">
        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="fixed top-16 left-4 right-4 z-50 mx-auto max-w-md px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm text-center shadow-md"
              role="status"
              aria-live="polite"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {phase === "scanner" && renderScanner()}
            {phase === "event-found" && renderEventFound()}
            {phase === "checkin" && renderCheckin()}
            {phase === "done" && renderDone()}
          </motion.div>
        </AnimatePresence>
      </main>
    </>
  );
}

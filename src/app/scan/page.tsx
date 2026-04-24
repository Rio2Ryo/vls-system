"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/components/ui/Card";
import {
  getParticipantByCheckinToken,
  getStoredParticipants,
  setStoredParticipants,
  getStoredEvents,
} from "@/lib/store";
import { Participant, EventData } from "@/lib/types";
import { fireWebhook } from "@/lib/webhook";

type Phase = "scanning" | "processing" | "success" | "already" | "not-found";

export default function ScanKioskPage() {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastScannedToken, setLastScannedToken] = useState("");
  const html5QrRef = useRef<unknown>(null);
  const phaseRef = useRef<Phase>("scanning");

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const extractToken = (text: string): string | null => {
    try {
      const url = new URL(text);
      const match = url.pathname.match(/\/checkin\/([a-zA-Z0-9]{8,20})/);
      if (match) return match[1];
    } catch { /* Not a URL */ }
    const raw = text.trim();
    if (/^[a-zA-Z0-9]{8,20}$/.test(raw)) return raw;
    return null;
  };

  const checkinViaApi = async (token: string): Promise<{
    found: boolean; alreadyCheckedIn?: boolean; participant?: Participant; event?: EventData | null;
  }> => {
    try {
      const res = await fetch(`/api/checkin/${token}`, { method: "POST" });
      if (!res.ok) return { found: false };
      const data = await res.json();
      const p: Participant = { id: data.participantId, name: data.participantName, eventId: data.eventId, checkedIn: true, checkedInAt: data.checkedInAt, registeredAt: 0 };
      const evt: EventData | null = data.eventName ? { id: data.eventId, name: data.eventName, date: data.eventDate || "", description: "", password: "", photos: [] } : null;
      return { found: true, alreadyCheckedIn: data.alreadyCheckedIn, participant: p, event: evt };
    } catch { return { found: false }; }
  };

  const handleQrResult = useCallback(async (text: string) => {
    if (phaseRef.current !== "scanning") return;
    const token = extractToken(text);
    if (!token || token === lastScannedToken) return;
    setLastScannedToken(token);
    setPhase("processing");

    // 1. Try localStorage
    const p = getParticipantByCheckinToken(token);
    if (p) {
      const events = getStoredEvents();
      setEvent(events.find((e) => e.id === p.eventId) || null);
      setParticipant(p);
      if (p.checkedIn) { setPhase("already"); return; }
      const all = getStoredParticipants();
      const now = Date.now();
      setStoredParticipants(all.map((pp) => pp.id === p.id ? { ...pp, checkedIn: true, checkedInAt: now } : pp));
      setParticipant({ ...p, checkedIn: true, checkedInAt: now });
      setPhase("success");
      fireWebhook("checkin", { eventId: p.eventId, participantName: p.name, participantEmail: p.email || undefined }, p.tenantId);
      return;
    }

    // 2. Fallback: API
    const apiResult = await checkinViaApi(token);
    if (apiResult.found && apiResult.participant) {
      setParticipant(apiResult.participant);
      setEvent(apiResult.event || null);
      setPhase(apiResult.alreadyCheckedIn ? "already" : "success");
      return;
    }

    setPhase("not-found");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastScannedToken]);

  const startScanner = useCallback(async () => {
    setCameraError(""); setScanning(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scannerId = "qr-reader";
      if (!document.getElementById(scannerId)) { setCameraError("スキャナー要素が見つかりません"); setScanning(false); return; }
      const scanner = new Html5Qrcode(scannerId);
      html5QrRef.current = scanner;
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 280, height: 280 } }, (t) => handleQrResult(t), () => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) setCameraError("カメラへのアクセスが許可されていません。");
      else if (msg.includes("NotFoundError")) setCameraError("カメラが見つかりません。");
      else setCameraError(`カメラエラー: ${msg}`);
      setScanning(false);
    }
  }, [handleQrResult]);

  const stopScanner = useCallback(async () => {
    try { const s = html5QrRef.current as { stop?: () => Promise<void> } | null; if (s?.stop) await s.stop(); } catch {}
    html5QrRef.current = null; setScanning(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => startScanner(), 500);
    return () => { clearTimeout(timer); stopScanner(); };
  }, [startScanner, stopScanner]);

  const handleTapToReset = () => {
    setPhase("scanning"); setParticipant(null); setEvent(null); setLastScannedToken("");
  };

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-gradient-to-r from-green-600 to-teal-600 text-white px-4 py-3 shadow-lg z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📱</span>
            <span className="text-sm font-bold">チェックインスキャナー</span>
          </div>
          <span className="text-xs bg-white/20 px-2 py-1 rounded-full">キオスクモード</span>
        </div>
      </div>

      {/* Content: always vertically centered */}
      <div className="flex-1 flex items-center justify-center bg-gray-900 p-4 overflow-hidden">
        <div className="w-full max-w-lg">

          {/* Scanning */}
          {phase === "scanning" && (
            <div className="relative">
              <div id="qr-reader" className="w-full rounded-2xl overflow-hidden bg-black" style={{ height: "min(60vw, 350px)" }} />
              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-2xl">
                  <div className="text-center p-6">
                    <p className="text-red-400 text-sm mb-3">{cameraError}</p>
                    <button onClick={startScanner} className="text-xs px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20">再試行</button>
                  </div>
                </div>
              )}
              {!scanning && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl">
                  <button onClick={startScanner} className="text-sm px-6 py-3 rounded-xl bg-green-500 text-white font-bold hover:bg-green-600 shadow-lg">カメラを起動</button>
                </div>
              )}
              {scanning && (
                <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
                    <p className="text-white text-sm font-medium">🔍 QRコードをかざしてください</p>
                  </motion.div>
                </div>
              )}
            </div>
          )}

          {/* Processing */}
          {phase === "processing" && (
            <Card className="text-center py-12">
              <div className="inline-flex items-center gap-1.5 mb-3">
                {[0, 1, 2].map((i) => (<div key={i} className="w-3 h-3 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />))}
              </div>
              <p className="text-gray-500 text-sm">確認中...</p>
            </Card>
          )}

          {/* Results — tap to reset */}
          <AnimatePresence mode="wait">
            {(phase === "success" || phase === "already" || phase === "not-found") && (
              <motion.div key={phase} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }} onClick={handleTapToReset} className="cursor-pointer">
                {phase === "success" && (
                  <Card className="text-center border-2 border-green-400 bg-green-50 py-8">
                    <span className="text-7xl block mb-4">✅</span>
                    <h2 className="text-3xl font-black text-green-700">チェックイン完了</h2>
                    <p className="text-2xl font-bold text-gray-800 mt-3">{participant?.name}</p>
                    {event && <p className="text-sm text-gray-500 mt-1">{event.name}</p>}
                    <p className="text-xs text-gray-400 mt-3">{new Date().toLocaleTimeString("ja-JP")}</p>
                    <p className="mt-6 text-sm text-gray-400 animate-pulse">タップして次のスキャンへ →</p>
                  </Card>
                )}
                {phase === "already" && (
                  <Card className="text-center border-2 border-yellow-400 bg-yellow-50 py-8">
                    <span className="text-7xl block mb-4">⚠️</span>
                    <h2 className="text-2xl font-bold text-yellow-700">チェックイン済みです</h2>
                    <p className="text-xl font-bold text-gray-800 mt-3">{participant?.name}</p>
                    {participant?.checkedInAt && <p className="text-sm text-gray-500 mt-2">時刻: {new Date(participant.checkedInAt).toLocaleTimeString("ja-JP")}</p>}
                    <p className="mt-6 text-sm text-gray-400 animate-pulse">タップして次のスキャンへ →</p>
                  </Card>
                )}
                {phase === "not-found" && (
                  <Card className="text-center border-2 border-red-400 bg-red-50 py-8">
                    <span className="text-7xl block mb-4">❌</span>
                    <h2 className="text-2xl font-bold text-red-700">QRコードが無効です</h2>
                    <p className="text-sm text-gray-500 mt-2">登録されていないQRコードです。<br />受付スタッフにお声がけください。</p>
                    <p className="mt-6 text-sm text-gray-400 animate-pulse">タップして次のスキャンへ →</p>
                  </Card>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

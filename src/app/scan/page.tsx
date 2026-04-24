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

  // Keep ref in sync with state (for use in scanner callback)
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Extract checkin token from QR content (URL or raw token)
  const extractToken = (text: string): string | null => {
    // Try: URL with /checkin/{token}
    try {
      const url = new URL(text);
      const match = url.pathname.match(/\/checkin\/([a-zA-Z0-9]{8,20})/);
      if (match) return match[1];
    } catch {
      // Not a URL
    }
    // Try: raw token (alphanumeric, 8-20 chars)
    const raw = text.trim();
    if (/^[a-zA-Z0-9]{8,20}$/.test(raw)) return raw;
    return null;
  };

  // Check-in via API (works when localStorage doesn't have data)
  const checkinViaApi = async (token: string): Promise<{
    found: boolean;
    alreadyCheckedIn?: boolean;
    participant?: Participant;
    event?: EventData | null;
  }> => {
    try {
      const res = await fetch(`/api/checkin/${token}`, { method: "POST" });
      if (res.status === 404) return { found: false };
      if (!res.ok) return { found: false };
      const data = await res.json();
      const p: Participant = {
        id: data.participantId,
        name: data.participantName,
        eventId: data.eventId,
        checkedIn: true,
        checkedInAt: data.checkedInAt,
        registeredAt: 0,
      };
      const evt: EventData | null = data.eventName
        ? { id: data.eventId, name: data.eventName, date: data.eventDate || "", description: "", password: "", photos: [] }
        : null;
      return { found: true, alreadyCheckedIn: data.alreadyCheckedIn, participant: p, event: evt };
    } catch {
      return { found: false };
    }
  };

  // Process a scanned QR code
  const handleQrResult = useCallback(
    async (text: string) => {
      if (phaseRef.current !== "scanning") return;

      const token = extractToken(text);
      if (!token) return;

      // Prevent duplicate processing of same QR
      if (token === lastScannedToken) return;
      setLastScannedToken(token);
      setPhase("processing");

      // 1. Try localStorage first
      const p = getParticipantByCheckinToken(token);
      if (p) {
        const events = getStoredEvents();
        const evt = events.find((e) => e.id === p.eventId) || null;
        setEvent(evt);
        setParticipant(p);

        if (p.checkedIn) {
          setPhase("already");
          return;
        }

        // Perform local check-in
        const all = getStoredParticipants();
        const now = Date.now();
        const updated = all.map((pp) =>
          pp.id === p.id ? { ...pp, checkedIn: true, checkedInAt: now } : pp
        );
        setStoredParticipants(updated);
        setParticipant({ ...p, checkedIn: true, checkedInAt: now });
        setPhase("success");

        fireWebhook("checkin", {
          eventId: p.eventId,
          participantName: p.name,
          participantEmail: p.email || undefined,
        }, p.tenantId);
        return;
      }

      // 2. Fallback: try API (D1 database)
      const apiResult = await checkinViaApi(token);
      if (apiResult.found && apiResult.participant) {
        setParticipant(apiResult.participant);
        setEvent(apiResult.event || null);
        setPhase(apiResult.alreadyCheckedIn ? "already" : "success");
        return;
      }

      // 3. Not found anywhere
      setPhase("not-found");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastScannedToken]
  );

  // Start camera scanner
  const startScanner = useCallback(async () => {
    setCameraError("");
    setScanning(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scannerId = "qr-reader";

      if (!document.getElementById(scannerId)) {
        setCameraError("スキャナー要素が見つかりません");
        setScanning(false);
        return;
      }

      const scanner = new Html5Qrcode(scannerId);
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 280 } },
        (decodedText) => {
          handleQrResult(decodedText);
        },
        () => {
          // No QR in frame — ignore
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
    } catch { /* ignore */ }
    html5QrRef.current = null;
    setScanning(false);
  }, []);

  // Auto-start scanner on mount
  useEffect(() => {
    const timer = setTimeout(() => startScanner(), 500);
    return () => { clearTimeout(timer); stopScanner(); };
  }, [startScanner, stopScanner]);

  // Tap anywhere on result screen to go back to scanning
  const handleTapToReset = () => {
    setPhase("scanning");
    setParticipant(null);
    setEvent(null);
    setLastScannedToken("");
  };

  return (
    <>
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-green-600 to-teal-600 text-white px-4 py-3 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">📱</span>
            <span className="text-sm font-bold">チェックインスキャナー</span>
          </div>
          <span className="text-xs bg-white/20 px-2 py-1 rounded-full">キオスクモード</span>
        </div>
      </div>

      <main className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg">

          {/* Scanning phase: show camera */}
          {phase === "scanning" && (
            <div className="relative">
              <div id="qr-reader" className="w-full rounded-2xl overflow-hidden bg-black min-h-[350px]" />
              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-2xl">
                  <div className="text-center p-6">
                    <p className="text-red-400 text-sm mb-3">{cameraError}</p>
                    <button onClick={startScanner} className="text-xs px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">再試行</button>
                  </div>
                </div>
              )}
              {!scanning && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl">
                  <button onClick={startScanner} className="text-sm px-6 py-3 rounded-xl bg-green-500 text-white font-bold hover:bg-green-600 transition-colors shadow-lg">カメラを起動</button>
                </div>
              )}
              {scanning && (
                <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
                    <p className="text-white text-sm font-medium">🔍 QRコードをかざしてください</p>
                  </motion.div>
                </div>
              )}
            </div>
          )}

          {/* Processing phase */}
          {phase === "processing" && (
            <Card className="text-center py-12">
              <div className="inline-flex items-center gap-1.5 mb-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-3 h-3 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <p className="text-gray-500 text-sm">確認中...</p>
            </Card>
          )}

          {/* Result phases: tap anywhere to go back */}
          <AnimatePresence mode="wait">
            {(phase === "success" || phase === "already" || phase === "not-found") && (
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                onClick={handleTapToReset}
                className="cursor-pointer"
              >
                {phase === "success" && (
                  <Card className="text-center border-2 border-green-400 bg-green-50">
                    <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", duration: 0.5 }}>
                      <span className="text-7xl block mb-4">✅</span>
                      <h2 className="text-3xl font-black text-green-700 mb-2">チェックイン完了</h2>
                      <p className="text-2xl font-bold text-gray-800 mt-3">{participant?.name}</p>
                      {event && <p className="text-sm text-gray-500 mt-1">{event.name}</p>}
                      <p className="text-xs text-gray-400 mt-4">{new Date().toLocaleTimeString("ja-JP")}</p>
                    </motion.div>
                    <p className="mt-6 text-sm text-gray-400 animate-pulse">タップして次のスキャンへ →</p>
                  </Card>
                )}

                {phase === "already" && (
                  <Card className="text-center border-2 border-yellow-400 bg-yellow-50">
                    <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", duration: 0.5 }}>
                      <span className="text-7xl block mb-4">⚠️</span>
                      <h2 className="text-2xl font-bold text-yellow-700 mb-2">チェックイン済みです</h2>
                      <p className="text-xl font-bold text-gray-800 mt-3">{participant?.name}</p>
                      {participant?.checkedInAt && (
                        <p className="text-sm text-gray-500 mt-2">
                          チェックイン時刻: {new Date(participant.checkedInAt).toLocaleTimeString("ja-JP")}
                        </p>
                      )}
                    </motion.div>
                    <p className="mt-6 text-sm text-gray-400 animate-pulse">タップして次のスキャンへ →</p>
                  </Card>
                )}

                {phase === "not-found" && (
                  <Card className="text-center border-2 border-red-400 bg-red-50">
                    <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", duration: 0.5 }}>
                      <span className="text-7xl block mb-4">❌</span>
                      <h2 className="text-2xl font-bold text-red-700 mb-2">QRコードが無効です</h2>
                      <p className="text-sm text-gray-500 mt-2">
                        登録されていないQRコードです。<br />受付スタッフにお声がけください。
                      </p>
                    </motion.div>
                    <p className="mt-6 text-sm text-gray-400 animate-pulse">タップして次のスキャンへ →</p>
                  </Card>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </>
  );
}

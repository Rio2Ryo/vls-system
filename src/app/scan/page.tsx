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

type Phase = "scanning" | "success" | "already" | "not-found";

const AUTO_RESET_MS = 4000; // auto-reset to scanning after 4 seconds

export default function ScanKioskPage() {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastScannedToken, setLastScannedToken] = useState("");
  const html5QrRef = useRef<unknown>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Process a scanned QR code
  const handleQrResult = useCallback(
    (text: string) => {
      if (phase !== "scanning") return;

      const token = extractToken(text);
      if (!token) return;

      // Prevent duplicate processing of same QR
      if (token === lastScannedToken) return;
      setLastScannedToken(token);

      const p = getParticipantByCheckinToken(token);
      if (!p) {
        setPhase("not-found");
        scheduleReset();
        return;
      }

      // Find event info
      const events = getStoredEvents();
      const evt = events.find((e) => e.id === p.eventId) || null;
      setEvent(evt);
      setParticipant(p);

      if (p.checkedIn) {
        setPhase("already");
        scheduleReset();
        return;
      }

      // Perform check-in
      const all = getStoredParticipants();
      const now = Date.now();
      const updated = all.map((pp) =>
        pp.id === p.id ? { ...pp, checkedIn: true, checkedInAt: now } : pp
      );
      setStoredParticipants(updated);
      setParticipant({ ...p, checkedIn: true, checkedInAt: now });
      setPhase("success");

      fireWebhook(
        "checkin",
        {
          eventId: p.eventId,
          participantName: p.name,
          participantEmail: p.email || undefined,
        },
        p.tenantId
      );

      scheduleReset();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, lastScannedToken]
  );

  const scheduleReset = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setPhase("scanning");
      setParticipant(null);
      setEvent(null);
      setLastScannedToken("");
    }, AUTO_RESET_MS);
  };

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
        setCameraError(
          "カメラへのアクセスが許可されていません。ブラウザの設定を確認してください。"
        );
      } else if (msg.includes("NotFoundError")) {
        setCameraError(
          "カメラが見つかりません。カメラ付きデバイスで開いてください。"
        );
      } else {
        setCameraError(`カメラエラー: ${msg}`);
      }
      setScanning(false);
    }
  }, [handleQrResult]);

  const stopScanner = useCallback(async () => {
    try {
      const scanner = html5QrRef.current as {
        stop?: () => Promise<void>;
      } | null;
      if (scanner?.stop) await scanner.stop();
    } catch {
      // ignore
    }
    html5QrRef.current = null;
    setScanning(false);
  }, []);

  // Auto-start scanner on mount
  useEffect(() => {
    const timer = setTimeout(() => startScanner(), 500);
    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [startScanner, stopScanner]);

  // Cleanup reset timer on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  // Manual reset
  const handleManualReset = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
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
            <span className="text-lg" aria-hidden="true">
              📱
            </span>
            <span className="text-sm font-bold">チェックインスキャナー</span>
          </div>
          <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
            キオスクモード
          </span>
        </div>
      </div>

      <main className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        {/* Scanner always visible in background */}
        <div className="w-full max-w-lg">
          <div className="relative">
            <div
              id="qr-reader"
              className="w-full rounded-2xl overflow-hidden bg-black min-h-[350px]"
            />
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-2xl">
                <div className="text-center p-6">
                  <p className="text-red-400 text-sm mb-3">{cameraError}</p>
                  <button
                    onClick={startScanner}
                    className="text-xs px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                  >
                    再試行
                  </button>
                </div>
              </div>
            )}
            {!scanning && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl">
                <button
                  onClick={startScanner}
                  className="text-sm px-6 py-3 rounded-xl bg-green-500 text-white font-bold hover:bg-green-600 transition-colors shadow-lg"
                >
                  カメラを起動
                </button>
              </div>
            )}
            {phase === "scanning" && scanning && (
              <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full"
                >
                  <p className="text-white text-sm font-medium">
                    🔍 QRコードをかざしてください
                  </p>
                </motion.div>
              </div>
            )}
          </div>

          {/* Result overlay */}
          <AnimatePresence mode="wait">
            {phase !== "scanning" && (
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="mt-6"
              >
                {phase === "success" && (
                  <Card className="text-center border-2 border-green-400 bg-green-50">
                    <motion.div
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", duration: 0.5 }}
                    >
                      <span className="text-6xl block mb-3">✅</span>
                      <h2 className="text-2xl font-black text-green-700 mb-1">
                        チェックイン完了
                      </h2>
                      <p className="text-xl font-bold text-gray-800 mt-2">
                        {participant?.name}
                      </p>
                      {event && (
                        <p className="text-sm text-gray-500 mt-1">
                          {event.name}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-3">
                        {new Date().toLocaleTimeString("ja-JP")}
                      </p>
                    </motion.div>
                    <button
                      onClick={handleManualReset}
                      className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      次のスキャンへ
                    </button>
                  </Card>
                )}

                {phase === "already" && (
                  <Card className="text-center border-2 border-yellow-400 bg-yellow-50">
                    <motion.div
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", duration: 0.5 }}
                    >
                      <span className="text-6xl block mb-3">⚠️</span>
                      <h2 className="text-xl font-bold text-yellow-700 mb-1">
                        チェックイン済みです
                      </h2>
                      <p className="text-lg font-bold text-gray-800 mt-2">
                        {participant?.name}
                      </p>
                      {participant?.checkedInAt && (
                        <p className="text-sm text-gray-500 mt-1">
                          チェックイン時刻:{" "}
                          {new Date(
                            participant.checkedInAt
                          ).toLocaleTimeString("ja-JP")}
                        </p>
                      )}
                    </motion.div>
                    <button
                      onClick={handleManualReset}
                      className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      次のスキャンへ
                    </button>
                  </Card>
                )}

                {phase === "not-found" && (
                  <Card className="text-center border-2 border-red-400 bg-red-50">
                    <motion.div
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", duration: 0.5 }}
                    >
                      <span className="text-6xl block mb-3">❌</span>
                      <h2 className="text-xl font-bold text-red-700 mb-1">
                        QRコードが無効です
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">
                        登録されていないQRコードです。
                        <br />
                        受付スタッフにお声がけください。
                      </p>
                    </motion.div>
                    <button
                      onClick={handleManualReset}
                      className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      次のスキャンへ
                    </button>
                  </Card>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Auto-reset countdown indicator */}
          {phase !== "scanning" && (
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: AUTO_RESET_MS / 1000, ease: "linear" }}
              className="h-1 bg-white/30 rounded-full mt-4 origin-left"
            />
          )}
        </div>
      </main>
    </>
  );
}

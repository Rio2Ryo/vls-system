"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { getStoredEvents, updateAnalyticsRecord } from "@/lib/store";
import { Company, PhotoData } from "@/lib/types";
import { fireWebhook } from "@/lib/webhook";

function EmailDownloadSection({ eventName, selectedPhotos }: { eventName: string; selectedPhotos: PhotoData[] }) {
  const [emailName, setEmailName] = useState("");
  const [emailAddr, setEmailAddr] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState("");

  const handleSendEmail = async () => {
    if (!emailName.trim() || !emailAddr.trim()) {
      setEmailError("名前とメールアドレスを入力してください");
      return;
    }
    setEmailError("");
    setEmailSending(true);

    try {
      const eventId = sessionStorage.getItem("eventId") || "";
      const photoIds = selectedPhotos.map((p) => p.id);
      const res = await fetch("/api/send-download-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: emailName, email: emailAddr, selectedPhotoIds: photoIds, eventId, eventName }),
      });
      if (!res.ok) throw new Error();
      setEmailSent(true);
    } catch {
      setEmailError("送信に失敗しました。もう一度お試しください。");
    }
    setEmailSending(false);
  };

  if (emailSent) {
    return (
      <Card className="text-center">
        <p className="text-sm text-green-600 font-medium">
          📧 {emailName}様にメールを送りました
        </p>
        <p className="text-xs text-gray-400 mt-1">7日以内にダウンロードしてください</p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-sm font-bold text-gray-700 mb-2">後でメールで受け取る</p>
      <p className="text-xs text-gray-400 mb-3">ダウンロードリンクをメールでお送りします（7日間有効）</p>
      <div className="space-y-2">
        <input
          type="text"
          placeholder="お名前"
          value={emailName}
          onChange={(e) => setEmailName(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm"
        />
        <input
          type="email"
          placeholder="メールアドレス"
          value={emailAddr}
          onChange={(e) => setEmailAddr(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm"
        />
        {emailError && <p className="text-xs text-red-400">{emailError}</p>}
        <Button onClick={handleSendEmail} disabled={emailSending} size="sm" variant="secondary" className="w-full">
          {emailSending ? "送信中..." : "メールで受け取る"}
        </Button>
      </div>
    </Card>
  );
}

function FrameCanvasPreview({ photo, companyName }: { photo: PhotoData | null; companyName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const photoImg = new Image();
    photoImg.crossOrigin = "anonymous";
    photoImg.onload = () => {
      canvas.width = photoImg.naturalWidth;
      canvas.height = photoImg.naturalHeight;
      ctx.drawImage(photoImg, 0, 0);

      const frameImg = new Image();
      frameImg.onload = () => {
        ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
        setDrawn(true);
      };
      frameImg.onerror = () => setDrawn(true);
      frameImg.src = "/frame-template.svg";
    };
    photoImg.onerror = () => setDrawn(false);
    photoImg.src = photo.thumbnailUrl;
  }, [photo]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <Card className="text-center">
      <p className="text-xs text-gray-400 mb-2">フレーム合成プレビュー</p>
      <div className="rounded-xl overflow-hidden">
        {photo ? (
          <canvas
            ref={canvasRef}
            className="w-full h-auto"
            style={{ display: drawn ? "block" : "none" }}
          />
        ) : null}
        {(!photo || !drawn) && (
          <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center">
            <span className="text-4xl" aria-hidden="true">📷</span>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        📷 {companyName} 提供のフレームが全ての写真に合成されます
      </p>
    </Card>
  );
}

/** Fetch an image and trigger browser download */
async function downloadImage(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback: open in new tab
    window.open(url, "_blank");
  }
}

export default function CompletePage() {
  const router = useRouter();
  const [photosDownloaded, setPhotosDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [eventName, setEventName] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoData[]>([]);

  useEffect(() => {
    if (!sessionStorage.getItem("eventId")) router.replace("/");
  }, [router]);

  const platinumCompany = useMemo((): Company | null => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(sessionStorage.getItem("platinumCompany") || "null");
    } catch {
      return null;
    }
  }, []);

  const platinumCompanies = useMemo((): Company[] => {
    if (typeof window === "undefined") return [];
    try {
      const arr = JSON.parse(sessionStorage.getItem("platinumCompanies") || "[]");
      if (Array.isArray(arr) && arr.length > 0) return arr.slice(0, 3);
      // Fallback to single platinumCompany
      return platinumCompany ? [platinumCompany] : [];
    } catch {
      return platinumCompany ? [platinumCompany] : [];
    }
  }, [platinumCompany]);

  const matchedCompany = useMemo((): Company | null => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(sessionStorage.getItem("matchedCompany") || "null");
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setEventName(sessionStorage.getItem("eventName") || "イベント");
    try {
      const ids: string[] = JSON.parse(sessionStorage.getItem("selectedPhotoIds") || "[]");
      setPhotoCount(ids.length);

      // Resolve actual photo data for downloads
      const eventId = sessionStorage.getItem("eventId");
      if (eventId && ids.length > 0) {
        const events = getStoredEvents();
        const event = events.find((e) => e.id === eventId);
        if (event) {
          const photos = event.photos.filter((p) => ids.includes(p.id));
          setSelectedPhotos(photos);
        }
      }
    } catch {
      setPhotoCount(0);
    }
  }, []);

  const handleDownloadPhotos = async () => {
    if (downloading) return;
    setDownloading(true);

    let didDownload = false;
    if (selectedPhotos.length > 0) {
      didDownload = true;
      for (let i = 0; i < selectedPhotos.length; i++) {
        const photo = selectedPhotos[i];
        const ext = photo.originalUrl.includes(".png") ? "png" : "jpg";
        const filename = `${eventName}_photo_${i + 1}.${ext}`;
        await downloadImage(photo.originalUrl, filename);
        if (i < selectedPhotos.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    setPhotosDownloaded(true);
    setDownloading(false);

    // Only record download if files were actually downloaded
    if (didDownload) {
      const analyticsId = sessionStorage.getItem("analyticsId");
      if (analyticsId) {
        updateAnalyticsRecord(analyticsId, {
          stepsCompleted: { downloaded: true },
        });
      }
      fireWebhook("download_complete", {
        eventId: sessionStorage.getItem("eventId") || undefined,
        eventName,
        participantName: sessionStorage.getItem("respondentName") || undefined,
        photoCount: selectedPhotos.length,
      });
    }
  };

  return (
    <main className="min-h-screen p-6 pt-10">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <motion.div
            className="text-5xl mb-3"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            🎉
          </motion.div>
          <h1 className="text-2xl font-bold text-gray-800">
            写真の準備ができました！
          </h1>
          {photoCount > 0 && (
            <p className="text-gray-400 text-sm mt-1" data-testid="photo-count-label">
              {photoCount}枚の写真が選択されています
            </p>
          )}
        </motion.div>

        {/* Frame composite preview (Canvas) */}
        {platinumCompany && (
          <FrameCanvasPreview
            photo={selectedPhotos.length > 0 ? selectedPhotos[0] : null}
            companyName={platinumCompany.name}
          />
        )}

        {/* Download photos */}
        <Card className="text-center">
          <p className="text-sm text-gray-600 mb-3">
            {photoCount > 1
              ? `${photoCount}枚の高画質写真をまとめてダウンロード`
              : "高画質写真をダウンロード"}
          </p>
          <Button
            onClick={handleDownloadPhotos}
            disabled={downloading}
            size="lg"
            variant={photosDownloaded ? "secondary" : "primary"}
          >
            {downloading
              ? "ダウンロード中..."
              : photosDownloaded
                ? "✓ ダウンロード済み"
                : "写真をダウンロード"}
          </Button>
        </Card>

        {/* Email download link */}
        <EmailDownloadSection eventName={eventName} selectedPhotos={selectedPhotos} />

        {/* Offer cards */}
        {matchedCompany && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card>
              <div className="flex items-center gap-3 mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={matchedCompany.logoUrl}
                  alt={matchedCompany.name}
                  className="w-12 h-12 rounded-full"
                />
                <div>
                  <p className="font-bold text-gray-700 text-sm">{matchedCompany.name}</p>
                  <p className="text-xs text-gray-400">限定オファー</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-yellow-50 to-pink-50 rounded-xl p-4 mb-3 border border-yellow-100">
                <p className="font-bold text-gray-700">{matchedCompany.offerText}</p>
                {matchedCompany.couponCode && (
                  <p className="text-xs text-gray-500 mt-1">
                    クーポンコード: <code className="bg-white px-2 py-0.5 rounded font-mono">{matchedCompany.couponCode}</code>
                  </p>
                )}
              </div>

              <a
                href={matchedCompany.offerUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="offer-link"
              >
                <Button variant="secondary" size="sm" className="w-full">
                  詳しく見る →
                </Button>
              </a>
            </Card>
          </motion.div>
        )}

        {/* Back to top */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center pb-8"
        >
          <button
            onClick={() => (window.location.href = "/")}
            aria-label="トップページに戻る"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
          >
            トップに戻る
          </button>
        </motion.div>
      </div>

      {/* Platinum sponsor banner — sticky bottom */}
      {platinumCompanies.length > 0 && (
        <div className="sticky bottom-0 z-10 bg-white/90 backdrop-blur border-t border-gray-100 py-2 px-4">
          <div className="max-w-lg mx-auto flex items-center justify-center gap-4">
            <span className="text-[10px] text-gray-400 flex-shrink-0">提供スポンサー</span>
            {platinumCompanies.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.logoUrl} alt={c.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                <span className="text-xs text-gray-600 font-medium hidden sm:inline">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

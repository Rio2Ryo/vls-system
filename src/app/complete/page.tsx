"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { getStoredEvents, updateAnalyticsRecord } from "@/lib/store";
import { Company, PhotoData } from "@/lib/types";

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
  const [downloaded, setDownloaded] = useState(false);
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

    setDownloaded(true);
    setDownloading(false);

    // Only record download if files were actually downloaded
    if (didDownload) {
      const analyticsId = sessionStorage.getItem("analyticsId");
      if (analyticsId) {
        updateAnalyticsRecord(analyticsId, {
          stepsCompleted: { downloaded: true },
        });
      }
    }
  };

  const handleDownloadFrame = () => {
    setDownloaded(true);
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

        {/* Platinum sponsor frame */}
        {platinumCompany && (
          <Card className="text-center">
            <div className="border-2 border-dashed border-blue-200 rounded-2xl p-4 mb-3">
              <p className="text-xs text-gray-400 mb-2">
                📷 {platinumCompany.name} 提供 記念フレーム
              </p>
              <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-8 text-center">
                <p className="text-lg font-bold text-gray-600">{eventName}</p>
                <p className="text-xs text-gray-400 mt-1">Special Photo Frame</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={platinumCompany.logoUrl}
                  alt={platinumCompany.name}
                  className="w-10 h-10 rounded-full mx-auto mt-3"
                />
              </div>
            </div>
            <Button onClick={handleDownloadFrame} size="md" variant={downloaded ? "secondary" : "primary"}>
              {downloaded ? "✓ 保存済み" : "記念フレームを保存"}
            </Button>
          </Card>
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
            variant={downloaded ? "secondary" : "primary"}
          >
            {downloading
              ? "ダウンロード中..."
              : downloaded
                ? "✓ ダウンロード済み"
                : "写真をダウンロード"}
          </Button>
        </Card>

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
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            トップに戻る
          </button>
        </motion.div>
      </div>
    </main>
  );
}

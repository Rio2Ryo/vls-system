"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { getStoredEvents } from "@/lib/store";
import { PhotoData } from "@/lib/types";

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
    window.open(url, "_blank");
  }
}

interface TokenData {
  name: string;
  eventId: string;
  photoIds: string[];
  expiresAt: number;
}

export default function DownloadLinkPage() {
  const params = useParams();
  const token = params.token as string;
  const [status, setStatus] = useState<"loading" | "valid" | "expired" | "error">("loading");
  const [data, setData] = useState<TokenData | null>(null);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [eventName, setEventName] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    fetch(`/api/download-link?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.status === 410) {
          setStatus("expired");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const json: TokenData = await res.json();
        setData(json);
        setStatus("valid");

        // Resolve photos from events store
        const events = getStoredEvents();
        const event = events.find((e) => e.id === json.eventId);
        if (event) {
          setEventName(event.name);
          setPhotos(event.photos.filter((p) => json.photoIds.includes(p.id)));
        }
      })
      .catch(() => setStatus("error"));
  }, [token]);

  const handleDownload = async () => {
    if (downloading || photos.length === 0) return;
    setDownloading(true);
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const ext = photo.originalUrl.includes(".png") ? "png" : "jpg";
      await downloadImage(photo.originalUrl, `${eventName}_photo_${i + 1}.${ext}`);
      if (i < photos.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    setDownloading(false);
    setDownloaded(true);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      {status === "loading" && (
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-sm text-gray-400">リンクを確認中...</p>
        </div>
      )}

      {status === "expired" && (
        <Card className="w-full max-w-md text-center">
          <p className="text-4xl mb-3">⏰</p>
          <h1 className="text-xl font-bold text-gray-800 mb-2">リンクの有効期限が切れています</h1>
          <p className="text-sm text-gray-500">このダウンロードリンクは有効期限（7日間）を過ぎています。</p>
          <p className="text-sm text-gray-500 mt-1">イベント主催者にお問い合わせください。</p>
        </Card>
      )}

      {status === "error" && (
        <Card className="w-full max-w-md text-center">
          <p className="text-4xl mb-3">❌</p>
          <h1 className="text-xl font-bold text-gray-800 mb-2">無効なリンクです</h1>
          <p className="text-sm text-gray-500">このダウンロードリンクは無効です。URLをご確認ください。</p>
        </Card>
      )}

      {status === "valid" && data && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-6">
          <div className="text-center">
            <p className="text-4xl mb-3">📸</p>
            <h1 className="text-2xl font-bold text-gray-800">{data.name}様</h1>
            <p className="text-sm text-gray-500 mt-1">
              {eventName || "イベント"}の写真をダウンロードできます
            </p>
            <p className="text-xs text-gray-400 mt-1">
              有効期限: {new Date(data.expiresAt).toLocaleDateString("ja-JP")}
            </p>
          </div>

          <Card className="text-center">
            <p className="text-sm text-gray-600 mb-3">
              {photos.length}枚の高画質写真をダウンロード
            </p>
            <Button
              onClick={handleDownload}
              disabled={downloading || photos.length === 0}
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

          {/* Photo thumbnails preview */}
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.slice(0, 6).map((p, i) => (
                <div key={p.id} className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumbnailUrl} alt={`写真 ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </main>
  );
}

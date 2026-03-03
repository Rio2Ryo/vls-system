"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

interface PhotoDetail {
  id: string;
  thumbnailUrl: string;
  originalUrl: string;
}

interface EventEntry {
  eventId: string;
  eventName: string;
  date: string;
  photoCount: number;
  photos: PhotoDetail[];
  downloadedAt: number | null;
}

interface PortalData {
  email: string;
  expiresAt: number;
  events: EventEntry[];
}

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

export default function MyPortalPage() {
  const params = useParams();
  const token = params.token as string;
  const [status, setStatus] = useState<"loading" | "valid" | "expired" | "error">("loading");
  const [data, setData] = useState<PortalData | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [downloadingEvent, setDownloadingEvent] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    fetch(`/api/my?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.status === 410) {
          setStatus("expired");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const json: PortalData = await res.json();
        setData(json);
        setStatus("valid");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  const handleDownloadAll = async (event: EventEntry) => {
    if (downloadingEvent || event.photos.length === 0) return;
    setDownloadingEvent(event.eventId);
    for (let i = 0; i < event.photos.length; i++) {
      const photo = event.photos[i];
      const ext = photo.originalUrl.includes(".png") ? "png" : "jpg";
      await downloadImage(photo.originalUrl, `${event.eventName}_photo_${i + 1}.${ext}`);
      if (i < event.photos.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    setDownloadingEvent(null);
  };

  return (
    <main className="min-h-screen p-6 pt-10 pb-24">
      {status === "loading" && (
        <div className="flex flex-col items-center justify-center min-h-[60vh]" role="status" aria-label="読み込み中">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-400">マイページを読み込み中...</p>
        </div>
      )}

      {status === "expired" && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md text-center">
            <p className="text-4xl mb-3">⏰</p>
            <h1 className="text-xl font-bold text-gray-800 mb-2">リンクの有効期限が切れています</h1>
            <p className="text-sm text-gray-500">このログインリンクは有効期限（7日間）を過ぎています。</p>
            <div className="mt-4">
              <a href="/my">
                <Button variant="secondary" size="sm">
                  新しいリンクを取得する
                </Button>
              </a>
            </div>
          </Card>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md text-center">
            <p className="text-4xl mb-3">❌</p>
            <h1 className="text-xl font-bold text-gray-800 mb-2">無効なリンクです</h1>
            <p className="text-sm text-gray-500">このログインリンクは無効です。URLをご確認ください。</p>
            <div className="mt-4">
              <a href="/my">
                <Button variant="secondary" size="sm">
                  マイページトップへ
                </Button>
              </a>
            </div>
          </Card>
        </div>
      )}

      {status === "valid" && data && (
        <div className="max-w-lg mx-auto space-y-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <p className="text-4xl mb-3">📋</p>
            <h1 className="text-2xl font-bold text-gray-800">
              {data.email} さんの参加履歴
            </h1>
            <p className="text-xs text-gray-400 mt-2">
              有効期限: {new Date(data.expiresAt).toLocaleDateString("ja-JP")}
            </p>
          </motion.div>

          {/* Event list */}
          {data.events.length === 0 ? (
            <Card className="text-center">
              <p className="text-sm text-gray-500">
                参加イベントまたはダウンロード履歴が見つかりませんでした。
              </p>
              <p className="text-xs text-gray-400 mt-1">
                イベント参加時に同じメールアドレスで登録されているか確認してください。
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {data.events.map((event, idx) => (
                <motion.div
                  key={event.eventId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                >
                  <Card>
                    {/* Event header — clickable to expand */}
                    <button
                      onClick={() =>
                        setExpandedEvent(
                          expandedEvent === event.eventId ? null : event.eventId
                        )
                      }
                      className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded-lg"
                      aria-label={`${event.eventName} の詳細を${expandedEvent === event.eventId ? "閉じる" : "開く"}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="font-bold text-gray-800">
                            {event.eventName}
                          </h2>
                          <div className="flex items-center gap-3 mt-1">
                            {event.date && (
                              <span className="text-xs text-gray-400">
                                {event.date}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              {event.photoCount}枚の写真
                            </span>
                          </div>
                          {event.downloadedAt && (
                            <p className="text-xs text-green-500 mt-1">
                              最終DL: {new Date(event.downloadedAt).toLocaleDateString("ja-JP")}
                            </p>
                          )}
                        </div>
                        <span className="text-gray-400 text-lg flex-shrink-0">
                          {expandedEvent === event.eventId ? "▲" : "▼"}
                        </span>
                      </div>
                    </button>

                    {/* Expanded content */}
                    {expandedEvent === event.eventId && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-4 space-y-3"
                      >
                        {/* Photo grid */}
                        {event.photos.length > 0 ? (
                          <>
                            <div className="grid grid-cols-3 gap-2">
                              {event.photos.map((photo, i) => (
                                <div
                                  key={photo.id}
                                  className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={photo.thumbnailUrl}
                                    alt={`写真 ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                            <Button
                              onClick={() => handleDownloadAll(event)}
                              disabled={downloadingEvent === event.eventId}
                              size="sm"
                              className="w-full"
                            >
                              {downloadingEvent === event.eventId
                                ? "ダウンロード中..."
                                : `${event.photos.length}枚を再ダウンロード`}
                            </Button>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400 text-center">
                            写真データが見つかりませんでした
                          </p>
                        )}
                      </motion.div>
                    )}
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

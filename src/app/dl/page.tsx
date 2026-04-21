"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import JSZip from "jszip";
import { getFrameTemplateForEvent } from "@/lib/store";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

function loadImage(src: string, useCors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

async function compositeToBlob(photoUrl: string, frameUrl: string): Promise<Blob> {
  const photoImg = await loadImage(photoUrl, true);
  const canvas = document.createElement("canvas");
  canvas.width = photoImg.naturalWidth;
  canvas.height = photoImg.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");

  ctx.drawImage(photoImg, 0, 0);

  try {
    const frameImg = await loadImage(frameUrl, false);
    ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
  } catch {
    // Frame load failed, continue without frame
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

function DownloadPageInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "ready" | "downloading" | "zipping" | "done" | "error">("loading");
  const [photos, setPhotos] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    const photosParam = searchParams.get("photos");
    const evtId = searchParams.get("event");
    if (!photosParam) {
      setStatus("error");
      return;
    }
    const photoList = photosParam.split(",").filter(Boolean);
    setPhotos(photoList);
    setEventId(evtId);
    setStatus("ready");
  }, [searchParams]);

  const handleDownload = useCallback(async () => {
    if (photos.length === 0) return;
    setStatus("downloading");
    const frameUrl = getFrameTemplateForEvent(eventId).url || "/frame-template.svg";

    const zip = new JSZip();
    let completed = 0;

    for (const name of photos) {
      const url = `/api/proxy/images/${name}`;
      const filename = `photo_${completed + 1}.png`;
      try {
        const blob = await compositeToBlob(url, frameUrl);
        zip.file(filename, blob);
      } catch {
        // Fallback: try raw image
        try {
          const res = await fetch(url);
          const fallbackBlob = await res.blob();
          zip.file(filename, fallbackBlob);
        } catch {
          // Skip this photo
        }
      }
      completed++;
      setProgress(completed);
    }

    setStatus("zipping");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const blobUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "photos.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    setStatus("done");
  }, [photos, eventId]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #e8eeff 100%)" }}>
      <Card className="w-full max-w-md text-center">
        {status === "loading" && (
          <p className="text-gray-500">読み込み中...</p>
        )}

        {status === "error" && (
          <div>
            <p className="text-4xl mb-3">❌</p>
            <p className="font-bold text-gray-700">無効なリンクです</p>
            <p className="text-sm text-gray-400 mt-1">このダウンロードリンクは無効です。</p>
          </div>
        )}

        {status === "ready" && (
          <div>
            <p className="text-4xl mb-3">📸</p>
            <p className="font-bold text-gray-700 text-lg mb-1">写真ダウンロード</p>
            <p className="text-sm text-gray-400 mb-4">
              {photos.length}枚の写真をZIPでダウンロードします
            </p>
            <Button onClick={handleDownload} size="lg">
              ZIPダウンロード開始
            </Button>
          </div>
        )}

        {status === "downloading" && (
          <div>
            <p className="text-4xl mb-3">⏳</p>
            <p className="font-bold text-gray-700">写真を準備中...</p>
            <p className="text-sm text-gray-400 mt-1">
              {progress} / {photos.length} 枚完了
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${(progress / photos.length) * 100}%`,
                  background: "linear-gradient(90deg, #6EC6FF, #a78bfa)",
                }}
              />
            </div>
          </div>
        )}

        {status === "zipping" && (
          <div>
            <p className="text-4xl mb-3 animate-pulse">📦</p>
            <p className="font-bold text-gray-700">ZIP作成中...</p>
          </div>
        )}

        {status === "done" && (
          <div>
            <p className="text-4xl mb-3">✅</p>
            <p className="font-bold text-gray-700">ダウンロード完了！</p>
            <p className="text-sm text-gray-400 mt-1">
              {photos.length}枚の写真がZIPでダウンロードされました
            </p>
          </div>
        )}
      </Card>
    </main>
  );
}

export default function DownloadPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center"><p>読み込み中...</p></main>}>
      <DownloadPageInner />
    </Suspense>
  );
}

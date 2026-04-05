"use client";

import { useState } from "react";

interface Photo {
  id: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  url?: string;
}

interface Props {
  eventId: string;
  photos: Photo[];
}

export function InsightFaceReindexButton({ eventId, photos }: Props) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ indexed: number; total: number } | null>(null);

  const run = async () => {
    if (!confirm(`FaceNet (512次元) で ${photos.length} 枚を再インデックスします。\n既存のfacenetデータは削除されます。続けますか？`)) return;

    setStatus("running");
    setProgress("FaceNet API に接続中...");
    setResult(null);

    const BATCH_SIZE = 10;
    const photoList = photos.map((p) => ({
      photoId: p.id,
      url: (p.originalUrl || p.thumbnailUrl || p.url || ""),
    })).filter((p) => p.url);

    let totalIndexed = 0;

    for (let i = 0; i < photoList.length; i += BATCH_SIZE) {
      const batch = photoList.slice(i, i + BATCH_SIZE);
      setProgress(`処理中... ${Math.min(i + BATCH_SIZE, photoList.length)} / ${photoList.length}`);

      try {
        const res = await fetch("/api/face/reindex-insightface", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            photos: batch,
            deleteFirst: i === 0, // Only delete on first batch
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        totalIndexed += data.indexedPhotos || 0;
      } catch (e) {
        setStatus("error");
        setProgress(`エラー: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }

    setStatus("done");
    setResult({ indexed: totalIndexed, total: photoList.length });
    setProgress(`完了: ${totalIndexed} / ${photoList.length} 枚をFaceNetでインデックス済み`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={status === "running"}
          className="rounded bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {status === "running" ? "インデックス中..." : "FaceNet再インデックス (512次元)"}
        </button>
        {status === "running" && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        )}
      </div>
      {progress && (
        <p className={`text-sm ${status === "error" ? "text-red-500" : status === "done" ? "text-green-600" : "text-gray-500"}`}>
          {progress}
        </p>
      )}
      {result && (
        <p className="text-xs text-gray-400">
          face-api.js (128次元) から FaceNet-PyTorch (512次元) にアップグレード完了。精度が大幅に向上します。
        </p>
      )}
    </div>
  );
}

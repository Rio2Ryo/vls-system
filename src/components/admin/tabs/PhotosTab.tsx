"use client";

import { useEffect, useState, useCallback } from "react";
import Card from "@/components/ui/Card";
import { EventData } from "@/lib/types";
import { getStoredEvents, getEventsForTenant } from "@/lib/store";
import { getAllImageNames, getImageUrl } from "@/lib/face-api-client";

interface Props {
  onSave: (msg: string) => void;
  activeEventId: string;
  tenantId?: string | null;
}

export default function PhotosTab({ onSave, activeEventId, tenantId }: Props) {
  const [events, setEvts] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [imageNames, setImageNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const evts = tenantId ? getEventsForTenant(tenantId) : getStoredEvents();
    setEvts(evts);
    if (activeEventId && evts.find((e) => e.id === activeEventId)) {
      setSelectedEventId(activeEventId);
    } else if (evts.length > 0) {
      setSelectedEventId(evts[0].id);
    }
  }, [activeEventId, tenantId]);

  // Fetch all image names from HF Space
  const loadImages = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      if (forceRefresh && typeof window !== "undefined") {
        sessionStorage.removeItem("__hf_image_names_cache");
      }
      const names = await getAllImageNames();
      setImageNames(names);
    } catch {
      // Keep existing images on error instead of clearing
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEventId === "evt-summer") {
      loadImages();
    } else {
      setImageNames([]);
    }
  }, [selectedEventId, loadImages]);

  const isSummerEvent = selectedEventId === "evt-summer";
  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const photoCount = isSummerEvent ? imageNames.length : (selectedEvent?.photos?.length ?? 0);

  // Upload photos to HF Space
  const handleUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) =>
      /\.(jpe?g|png|webp|bmp)$/i.test(f.name)
    );
    if (fileArray.length === 0) {
      onSave("アップロード可能なファイルがありません");
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: fileArray.length });

    // Upload in batches of 5 to avoid timeout
    const BATCH_SIZE = 5;
    let totalUploaded = 0;
    let totalFaces = 0;

    for (let i = 0; i < fileArray.length; i += BATCH_SIZE) {
      const batch = fileArray.slice(i, i + BATCH_SIZE);
      const formData = new FormData();
      batch.forEach((file) => formData.append("images", file));

      try {
        const res = await fetch("/api/proxy/upload-images", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          totalUploaded += data.uploaded ?? 0;
          totalFaces += data.faces_found ?? 0;
        }
      } catch {
        // continue with next batch
      }
      setUploadProgress({ current: Math.min(i + BATCH_SIZE, fileArray.length), total: fileArray.length });
    }

    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    onSave(`${totalUploaded}枚アップロード完了（${totalFaces}件の顔を検出）`);

    // Reload image list with fresh data
    await loadImages(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files);
  };

  // Delete a photo from HF Space
  const handleDelete = async (imageName: string) => {
    if (!window.confirm(`「${imageName}」を削除しますか？`)) return;
    setDeleting(imageName);
    try {
      const res = await fetch("/api/proxy/delete-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_name: imageName }),
      });
      if (res.ok) {
        setImageNames((prev) => prev.filter((n) => n !== imageName));
        if (previewImage === imageName) setPreviewImage(null);
        // Clear cache so deleted image doesn't reappear on reload
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("__hf_image_names_cache");
        }
        onSave(`${imageName} を削除しました`);
      } else {
        onSave("削除に失敗しました");
      }
    } catch {
      onSave("削除に失敗しました");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="admin-photos">
      <h2 className="text-lg font-bold text-gray-800">写真管理</h2>

      <Card>
        <label className="text-sm font-bold text-gray-600 mb-2 block">対象イベント</label>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-center bg-white dark:bg-gray-700 dark:text-gray-100"
          data-testid="photo-event-select"
        >
          {events.map((evt) => (
            <option key={evt.id} value={evt.id}>
              {evt.name} ({evt.id === "evt-summer" ? imageNames.length || evt.photos.length : evt.photos.length}枚)
            </option>
          ))}
        </select>
      </Card>

      {/* Upload zone - summer event only */}
      {isSummerEvent && (
        <Card>
          <div
            role="button"
            tabIndex={0}
            aria-label="写真をドラッグ＆ドロップまたはクリックして追加"
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
              dragging ? "border-[#6EC6FF] bg-blue-50" : "border-gray-200 hover:border-[#6EC6FF]"
            } ${uploading ? "pointer-events-none opacity-60" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && document.getElementById("admin-photo-upload")?.click()}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !uploading) { e.preventDefault(); document.getElementById("admin-photo-upload")?.click(); } }}
          >
            {uploading ? (
              <>
                <div className="text-3xl mb-2 animate-pulse">📤</div>
                <p className="font-medium text-gray-600 text-sm">
                  アップロード中... ({uploadProgress.current}/{uploadProgress.total})
                </p>
                <div className="w-48 mx-auto mt-2 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-[#6EC6FF] h-1.5 rounded-full transition-all"
                    style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">HF Spaceに直接アップロード＆顔検出を実行中</p>
              </>
            ) : (
              <>
                <div className="text-3xl mb-1">➕</div>
                <p className="font-medium text-gray-600 text-sm">写真を追加</p>
                <p className="text-[10px] text-gray-400 mt-1">ドラッグ＆ドロップ or クリック（JPEG, PNG, WebP）</p>
              </>
            )}
            <input
              id="admin-photo-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/bmp"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </Card>
      )}

      {/* Photo grid */}
      {isSummerEvent && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-700 dark:text-gray-200">
              {loading ? "読み込み中..." : `登録済み写真 (${photoCount}枚)`}
            </h3>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center gap-1.5 mb-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <p className="text-sm text-gray-400">HF Spaceから画像を読み込んでいます...</p>
            </div>
          ) : imageNames.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">写真がありません</p>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {imageNames.map((name) => (
                <div key={name} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getImageUrl(name)}
                    alt={name}
                    loading="lazy"
                    className="w-full aspect-[4/3] object-cover rounded-lg bg-gray-100 cursor-pointer"
                    onClick={() => setPreviewImage(name)}
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors rounded-lg flex flex-col items-center justify-center opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => setPreviewImage(name)}
                      className="text-[10px] px-2 py-1 rounded-full bg-white/90 text-gray-700 font-medium mb-1 hover:bg-white"
                    >
                      プレビュー
                    </button>
                    <button
                      onClick={() => handleDelete(name)}
                      disabled={deleting === name}
                      className="text-[10px] px-2 py-1 rounded-full bg-red-500 text-white font-medium hover:bg-red-600 disabled:opacity-50"
                    >
                      {deleting === name ? "削除中..." : "削除"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Non-summer event placeholder */}
      {!isSummerEvent && (
        <Card>
          <div className="text-center py-8">
            <div className="text-5xl mb-3">📷</div>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {selectedEvent?.photos?.length ?? 0}枚
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">登録済み写真</p>
          </div>
        </Card>
      )}

      {/* Preview modal */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/85 flex items-center justify-center z-[9999] cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getImageUrl(previewImage)}
            alt={previewImage}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <span className="text-white/70 text-sm bg-black/50 px-3 py-1 rounded-full">
              {previewImage}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(previewImage); }}
              className="text-sm px-4 py-1.5 rounded-full bg-red-500 text-white font-medium hover:bg-red-600"
            >
              この写真を削除
            </button>
          </div>
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white border-none text-xl flex items-center justify-center cursor-pointer hover:bg-white/30"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

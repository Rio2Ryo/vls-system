"use client";

import { useEffect, useState, useCallback } from "react";
import Card from "@/components/ui/Card";
import { EventData, PhotoData } from "@/lib/types";
import { getStoredEvents, getEventsForTenant, setStoredEvents } from "@/lib/store";
import { getAllImageNames, getImageUrl } from "@/lib/face-api-client";

interface Props {
  onSave: (msg: string) => void;
  activeEventId: string;
  tenantId?: string | null;
}

export default function PhotosTab({ onSave, activeEventId, tenantId }: Props) {
  const [events, setEvts] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  // HF Space images (for evt-summer)
  const [hfImageNames, setHfImageNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewIsHf, setPreviewIsHf] = useState(false);
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

  const isSummerEvent = selectedEventId === "evt-summer";
  const selectedEvent = events.find((e) => e.id === selectedEventId);

  // Load HF images for summer event
  const loadHfImages = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      if (forceRefresh && typeof window !== "undefined") {
        sessionStorage.removeItem("__hf_image_names_cache");
      }
      const names = await getAllImageNames();
      setHfImageNames(names);
    } catch {
      // Keep existing
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSummerEvent) {
      loadHfImages();
    } else {
      setHfImageNames([]);
    }
  }, [selectedEventId, isSummerEvent, loadHfImages]);

  const photoCount = isSummerEvent ? hfImageNames.length : (selectedEvent?.photos?.length ?? 0);

  // ─── HF Space upload (summer event) ───
  const handleHfUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => /\.(jpe?g|png|webp|bmp)$/i.test(f.name));
    if (fileArray.length === 0) { onSave("アップロード可能なファイルがありません"); return; }

    setUploading(true);
    setUploadProgress({ current: 0, total: fileArray.length });
    const BATCH_SIZE = 5;
    let totalUploaded = 0, totalFaces = 0;

    for (let i = 0; i < fileArray.length; i += BATCH_SIZE) {
      const batch = fileArray.slice(i, i + BATCH_SIZE);
      const formData = new FormData();
      batch.forEach((file) => formData.append("images", file));
      try {
        const res = await fetch("/api/proxy/upload-images", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          totalUploaded += data.uploaded ?? 0;
          totalFaces += data.faces_found ?? 0;
        }
      } catch { /* continue */ }
      setUploadProgress({ current: Math.min(i + BATCH_SIZE, fileArray.length), total: fileArray.length });
    }

    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    onSave(`${totalUploaded}枚アップロード完了（${totalFaces}件の顔を検出）`);
    await loadHfImages(true);
  };

  const handleHfDelete = async (imageName: string) => {
    if (!window.confirm(`「${imageName}」を削除しますか？`)) return;
    setDeleting(imageName);
    try {
      const res = await fetch("/api/proxy/delete-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_name: imageName }),
      });
      if (res.ok) {
        setHfImageNames((prev) => prev.filter((n) => n !== imageName));
        if (previewImage === imageName) setPreviewImage(null);
        sessionStorage.removeItem("__hf_image_names_cache");
        onSave(`${imageName} を削除しました`);
      } else { onSave("削除に失敗しました"); }
    } catch { onSave("削除に失敗しました"); }
    finally { setDeleting(null); }
  };

  // ─── Local upload (non-summer events) ───
  // Resize image to max 800px and compress as JPEG to stay within localStorage limits
  const resizeImage = (file: File, maxSize = 800): Promise<{ full: string; thumb: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          // Full size (max 800px)
          const fullCanvas = document.createElement("canvas");
          let w = img.width, h = img.height;
          if (w > maxSize || h > maxSize) {
            if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
            else { w = Math.round(w * maxSize / h); h = maxSize; }
          }
          fullCanvas.width = w;
          fullCanvas.height = h;
          fullCanvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
          const full = fullCanvas.toDataURL("image/jpeg", 0.7);

          // Thumbnail (max 200px)
          const thumbCanvas = document.createElement("canvas");
          let tw = img.width, th = img.height;
          const thumbMax = 200;
          if (tw > thumbMax || th > thumbMax) {
            if (tw > th) { th = Math.round(th * thumbMax / tw); tw = thumbMax; }
            else { tw = Math.round(tw * thumbMax / th); th = thumbMax; }
          }
          thumbCanvas.width = tw;
          thumbCanvas.height = th;
          thumbCanvas.getContext("2d")!.drawImage(img, 0, 0, tw, th);
          const thumb = thumbCanvas.toDataURL("image/jpeg", 0.5);

          resolve({ full, thumb });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });

  const handleLocalUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => /\.(jpe?g|png|webp|bmp)$/i.test(f.name));
    if (fileArray.length === 0) { onSave("アップロード可能なファイルがありません"); return; }
    if (!selectedEvent) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: fileArray.length });

    const newPhotos: PhotoData[] = [];
    for (let i = 0; i < fileArray.length; i++) {
      try {
        const { full, thumb } = await resizeImage(fileArray[i]);
        const photoId = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        newPhotos.push({
          id: photoId,
          originalUrl: full,
          thumbnailUrl: thumb,
          watermarked: false,
          uploadedAt: Date.now(),
          originalSize: fileArray[i].size,
        });
      } catch { /* skip */ }
      setUploadProgress({ current: i + 1, total: fileArray.length });
    }

    // Update event photos
    const fullEvents = getStoredEvents();
    const updated = fullEvents.map((ev) => {
      if (ev.id !== selectedEventId) return ev;
      return { ...ev, photos: [...ev.photos, ...newPhotos] };
    });
    try {
      setStoredEvents(updated);
    } catch {
      onSave("保存容量を超えました。写真の枚数を減らしてください。");
      setUploading(false);
      return;
    }
    setEvts(tenantId ? updated.filter((e) => e.tenantId === tenantId) : updated);

    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    onSave(`${newPhotos.length}枚アップロード完了`);
  };

  const handleLocalDelete = (photoId: string) => {
    if (!window.confirm("この写真を削除しますか？")) return;
    const fullEvents = getStoredEvents();
    const updated = fullEvents.map((ev) => {
      if (ev.id !== selectedEventId) return ev;
      return { ...ev, photos: ev.photos.filter((p) => p.id !== photoId) };
    });
    setStoredEvents(updated);
    setEvts(tenantId ? updated.filter((e) => e.tenantId === tenantId) : updated);
    if (previewImage === photoId) setPreviewImage(null);
    onSave("写真を削除しました");
  };

  // ─── Unified handlers ───
  const handleUpload = (files: FileList | File[]) => {
    if (isSummerEvent) handleHfUpload(files);
    else handleLocalUpload(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files);
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
              {evt.name} ({evt.id === "evt-summer" ? hfImageNames.length || evt.photos.length : evt.photos.length}枚)
            </option>
          ))}
        </select>
      </Card>

      {/* Upload zone — all events */}
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

      {/* Photo grid */}
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
                <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <p className="text-sm text-gray-400">画像を読み込んでいます...</p>
          </div>
        ) : isSummerEvent ? (
          /* HF Space images */
          hfImageNames.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">写真がありません</p>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {hfImageNames.map((name) => (
                <div key={name} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getImageUrl(name)} alt={name} loading="lazy" className="w-full aspect-[4/3] object-cover rounded-lg bg-gray-100 cursor-pointer" onClick={() => { setPreviewImage(name); setPreviewIsHf(true); }} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors rounded-lg flex flex-col items-center justify-center opacity-0 group-hover:opacity-100">
                    <button onClick={() => { setPreviewImage(name); setPreviewIsHf(true); }} className="text-[10px] px-2 py-1 rounded-full bg-white/90 text-gray-700 font-medium mb-1 hover:bg-white">プレビュー</button>
                    <button onClick={() => handleHfDelete(name)} disabled={deleting === name} className="text-[10px] px-2 py-1 rounded-full bg-red-500 text-white font-medium hover:bg-red-600 disabled:opacity-50">{deleting === name ? "削除中..." : "削除"}</button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Local event photos */
          (selectedEvent?.photos?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">写真がありません。上のエリアから追加してください。</p>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {selectedEvent!.photos.map((photo) => (
                <div key={photo.id} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.thumbnailUrl || photo.originalUrl} alt={photo.id} loading="lazy" className="w-full aspect-[4/3] object-cover rounded-lg bg-gray-100 cursor-pointer" onClick={() => { setPreviewImage(photo.id); setPreviewIsHf(false); }} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors rounded-lg flex flex-col items-center justify-center opacity-0 group-hover:opacity-100">
                    <button onClick={() => { setPreviewImage(photo.id); setPreviewIsHf(false); }} className="text-[10px] px-2 py-1 rounded-full bg-white/90 text-gray-700 font-medium mb-1 hover:bg-white">プレビュー</button>
                    <button onClick={() => handleLocalDelete(photo.id)} className="text-[10px] px-2 py-1 rounded-full bg-red-500 text-white font-medium hover:bg-red-600">削除</button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </Card>

      {/* Preview modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[9999] cursor-pointer" onClick={() => setPreviewImage(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewIsHf ? getImageUrl(previewImage) : (selectedEvent?.photos.find((p) => p.id === previewImage)?.originalUrl || "")}
            alt={previewImage}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <span className="text-white/70 text-sm bg-black/50 px-3 py-1 rounded-full">{previewImage}</span>
            <button
              onClick={(e) => { e.stopPropagation(); if (previewIsHf) { handleHfDelete(previewImage); } else { handleLocalDelete(previewImage); } }}
              className="text-sm px-4 py-1.5 rounded-full bg-red-500 text-white font-medium hover:bg-red-600"
            >
              この写真を削除
            </button>
          </div>
          <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white border-none text-xl flex items-center justify-center cursor-pointer hover:bg-white/30">✕</button>
        </div>
      )}
    </div>
  );
}

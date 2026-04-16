"use client";

import { useEffect, useState, useCallback } from "react";
import Card from "@/components/ui/Card";
import { EventData, PhotoData } from "@/lib/types";
import { getStoredEvents, setStoredEvents, getEventsForTenant } from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";
import { logAudit } from "@/lib/audit";
import { inputCls, uploadFileToR2, createThumbnailBlobAR, readAsDataUrl, resizeImageBlob, validateImageFiles } from "./adminUtils";

interface Props {
  onSave: (msg: string) => void;
  activeEventId: string;
  tenantId?: string | null;
}

export default function PhotosTab({ onSave, activeEventId, tenantId }: Props) {
  const [events, setEvts] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploadFileNames, setUploadFileNames] = useState<string[]>([]);

  useEffect(() => {
    const evts = tenantId ? getEventsForTenant(tenantId) : getStoredEvents();
    setEvts(evts);
    if (activeEventId && evts.find((e) => e.id === activeEventId)) {
      setSelectedEventId(activeEventId);
    } else if (evts.length > 0) {
      setSelectedEventId(evts[0].id);
    }
  }, [activeEventId, tenantId]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  // Helper to update events state and persist
  const persistEvents = useCallback((updated: EventData[]) => {
    setStoredEvents(updated);
    setEvts(updated);
  }, []);

  const addPhotos = async (files: FileList) => {
    if (!selectedEvent) return;

    const fileArray = Array.from(files);
    const { valid, errors } = validateImageFiles(fileArray);
    setUploadErrors(errors);

    if (valid.length === 0) {
      if (errors.length > 0) onSave("アップロード可能なファイルがありません");
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: valid.length });
    setUploadFileNames(valid.map((f) => f.name));

    const newPhotos: PhotoData[] = [];
    const uploadTimestamp = Date.now();

    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];
      setUploadProgress({ current: i + 1, total: valid.length });

      // Client-side resize original to max 2048px
      const resizedBlob = await resizeImageBlob(file, 2048);
      const resizedFile = new File([resizedBlob], file.name, { type: "image/jpeg" });

      const originalResult = await uploadFileToR2(resizedFile, selectedEventId, "photos");

      let thumbResult: { key: string; url: string } | null = null;
      if (originalResult) {
        const thumbBlob = await createThumbnailBlobAR(file, 400, 400);
        const thumbFile = new File([thumbBlob], file.name, { type: "image/jpeg" });
        thumbResult = await uploadFileToR2(thumbFile, selectedEventId, "thumbs");
      }

      if (originalResult && thumbResult) {
        newPhotos.push({
          id: `uploaded-${uploadTimestamp}-${i}`,
          originalUrl: originalResult.url,
          thumbnailUrl: thumbResult.url,
          watermarked: true,
          uploadedAt: uploadTimestamp,
          originalSize: file.size,
          optimizedSize: resizedBlob.size,
        });
      } else {
        const dataUrl = await readAsDataUrl(resizedFile);
        const thumbBlob = await createThumbnailBlobAR(file, 400, 400);
        const thumbDataUrl = await readAsDataUrl(new File([thumbBlob], file.name));
        newPhotos.push({
          id: `uploaded-${uploadTimestamp}-${i}`,
          originalUrl: dataUrl,
          thumbnailUrl: thumbDataUrl,
          watermarked: true,
          uploadedAt: uploadTimestamp,
          originalSize: file.size,
          optimizedSize: resizedBlob.size,
        });
      }
    }

    const updated = events.map((e) =>
      e.id === selectedEventId
        ? { ...e, photos: [...e.photos, ...newPhotos] }
        : e
    );
    persistEvents(updated);
    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    setUploadFileNames([]);

    // Calculate total savings
    const totalOriginal = newPhotos.reduce((s, p) => s + (p.originalSize || 0), 0);
    const totalOptimized = newPhotos.reduce((s, p) => s + (p.optimizedSize || 0), 0);
    const savedPct = totalOriginal > 0 ? Math.round((1 - totalOptimized / totalOriginal) * 100) : 0;
    const savedMsg = savedPct > 0 ? ` (${savedPct}%圧縮)` : "";
    onSave(`${newPhotos.length}枚の写真を追加しました${savedMsg}`);
    logAudit("photo_upload", { type: "photo", id: selectedEventId, name: selectedEvent?.name }, { count: newPhotos.length });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) addPhotos(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addPhotos(e.target.files);
  };

  const removePhoto = (photoId: string) => {
    const updated = events.map((e) =>
      e.id === selectedEventId
        ? { ...e, photos: e.photos.filter((p) => p.id !== photoId) }
        : e
    );
    persistEvents(updated);
    onSave("写真を削除しました");
    logAudit("photo_delete", { type: "photo", id: photoId });
  };

  const photos = selectedEvent?.photos ?? [];

  return (
    <div className="space-y-4" data-testid="admin-photos">
      <h2 className="text-lg font-bold text-gray-800">写真管理</h2>

      <Card>
        <label className="text-sm font-bold text-gray-600 mb-2 block">対象イベント</label>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className={inputCls}
          data-testid="photo-event-select"
        >
          {events.map((evt) => (
            <option key={evt.id} value={evt.id}>{evt.name} ({evt.photos.length}枚)</option>
          ))}
        </select>
      </Card>

      {!IS_DEMO_MODE && (
        <Card>
          <div
            role="button"
            tabIndex={0}
            aria-label="写真をドラッグ＆ドロップまたはクリックして選択"
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
              dragging ? "border-[#6EC6FF] bg-blue-50" : "border-gray-200 hover:border-[#6EC6FF]"
            } ${uploading ? "pointer-events-none opacity-60" : ""}`}
            data-testid="photo-upload-zone"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && document.getElementById("photo-file-input")?.click()}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !uploading) { e.preventDefault(); document.getElementById("photo-file-input")?.click(); } }}
          >
            {uploading ? (
              <>
                <div className="text-4xl mb-2 animate-pulse">📤</div>
                <p className="font-medium text-gray-600">
                  アップロード中... ({uploadProgress.current}/{uploadProgress.total})
                </p>
                <div className="w-48 mx-auto mt-3 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-[#6EC6FF] h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="text-4xl mb-2">📁</div>
                <p className="font-medium text-gray-600">写真をドラッグ＆ドロップ</p>
                <p className="text-xs text-gray-400 mt-1">またはクリックしてファイルを選択</p>
                <p className="text-[10px] text-gray-300 dark:text-gray-500 mt-2">JPEG, PNG, WebP, HEIC対応 ・ 最大20MB/枚</p>
              </>
            )}

            {/* Upload progress - per file */}
            {uploading && uploadFileNames.length > 0 && (
              <div className="mt-3 space-y-1">
                {uploadFileNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full text-[10px] ${
                      i < uploadProgress.current - 1 ? "bg-green-100 text-green-600" :
                      i === uploadProgress.current - 1 ? "bg-blue-100 text-blue-600 animate-pulse" :
                      "bg-gray-100 text-gray-400"
                    }`}>
                      {i < uploadProgress.current - 1 ? "\u2713" : i === uploadProgress.current - 1 ? "\u2191" : "\u00b7"}
                    </span>
                    <span className={`truncate max-w-[200px] ${
                      i < uploadProgress.current - 1 ? "text-gray-500 dark:text-gray-400" :
                      i === uploadProgress.current - 1 ? "text-blue-600 dark:text-blue-400 font-medium" :
                      "text-gray-300 dark:text-gray-600"
                    }`}>{name}</span>
                    {i === uploadProgress.current - 1 && (
                      <span className="text-[10px] text-blue-400">リサイズ+アップロード中...</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Validation errors */}
            {uploadErrors.length > 0 && (
              <div className="mt-3 space-y-1">
                {uploadErrors.map((err, i) => (
                  <p key={i} className="text-xs text-red-500 dark:text-red-400">{err}</p>
                ))}
              </div>
            )}

            <input
              id="photo-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,.heic,.heif"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              data-testid="photo-file-input"
            />
          </div>
        </Card>
      )}

      {/* Photo grid */}
      {selectedEvent && photos.length > 0 && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">
            登録済み写真 ({photos.length}枚)
          </h3>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumbnailUrl}
                  alt={p.id}
                  className="w-full aspect-[4/3] object-cover rounded-lg"
                />

                {/* Hover overlay with delete */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                  {!IS_DEMO_MODE && (
                    <button
                      onClick={() => removePhoto(p.id)}
                      aria-label={`写真${p.id}を削除`}
                      className="text-xs px-3 py-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 font-medium focus:outline-none focus-visible:ring-1 focus-visible:ring-white"
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty state */}
      {selectedEvent && photos.length === 0 && (
        <Card>
          <p className="text-sm text-gray-400 text-center py-6">
            写真がありません
          </p>
        </Card>
      )}
    </div>
  );
}

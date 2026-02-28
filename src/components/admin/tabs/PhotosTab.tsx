"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { EventData, PhotoData } from "@/lib/types";
import { getStoredEvents, setStoredEvents, getEventsForTenant } from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";
import { inputCls, uploadFileToR2, createThumbnailBlob, readAsDataUrl } from "./adminUtils";

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

  const addPhotos = async (files: FileList) => {
    if (!selectedEvent) return;

    const fileArray = Array.from(files);
    setUploading(true);
    setUploadProgress({ current: 0, total: fileArray.length });

    const newPhotos: PhotoData[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setUploadProgress({ current: i + 1, total: fileArray.length });

      const originalResult = await uploadFileToR2(file, selectedEventId, "photos");

      let thumbResult: { key: string; url: string } | null = null;
      if (originalResult) {
        const thumbBlob = await createThumbnailBlob(file);
        const thumbFile = new File([thumbBlob], file.name, { type: "image/jpeg" });
        thumbResult = await uploadFileToR2(thumbFile, selectedEventId, "thumbs");
      }

      if (originalResult && thumbResult) {
        newPhotos.push({
          id: `uploaded-${Date.now()}-${i}`,
          originalUrl: originalResult.url,
          thumbnailUrl: thumbResult.url,
          watermarked: true,
        });
      } else {
        const dataUrl = await readAsDataUrl(file);
        const thumbBlob = await createThumbnailBlob(file);
        const thumbDataUrl = await readAsDataUrl(new File([thumbBlob], file.name));
        newPhotos.push({
          id: `uploaded-${Date.now()}-${i}`,
          originalUrl: dataUrl,
          thumbnailUrl: thumbDataUrl,
          watermarked: true,
        });
      }
    }

    const updated = events.map((e) =>
      e.id === selectedEventId
        ? { ...e, photos: [...e.photos, ...newPhotos] }
        : e
    );
    setStoredEvents(updated);
    setEvts(updated);
    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    onSave(`${newPhotos.length}枚の写真を追加しました`);
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
    setStoredEvents(updated);
    setEvts(updated);
    onSave("写真を削除しました");
  };

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
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? "border-[#6EC6FF] bg-blue-50" : "border-gray-200 hover:border-[#6EC6FF]"
            } ${uploading ? "pointer-events-none opacity-60" : ""}`}
            data-testid="photo-upload-zone"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && document.getElementById("photo-file-input")?.click()}
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
              </>
            )}
            <input
              id="photo-file-input"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              data-testid="photo-file-input"
            />
          </div>
        </Card>
      )}

      {selectedEvent && selectedEvent.photos.length > 0 && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">登録済み写真 ({selectedEvent.photos.length}枚)</h3>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
            {selectedEvent.photos.map((p) => (
              <div key={p.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumbnailUrl}
                  alt={p.id}
                  className="w-full aspect-[4/3] object-cover rounded-lg"
                />
                {!IS_DEMO_MODE && (
                  <button
                    onClick={() => removePhoto(p.id)}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

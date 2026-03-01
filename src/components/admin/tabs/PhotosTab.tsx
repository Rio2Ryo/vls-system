"use client";

import { useEffect, useState, useCallback } from "react";
import Card from "@/components/ui/Card";
import { EventData, PhotoClassification, PhotoData } from "@/lib/types";
import { getStoredEvents, setStoredEvents, getEventsForTenant } from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";
import { inputCls, uploadFileToR2, createThumbnailBlob, readAsDataUrl } from "./adminUtils";
import { csrfHeaders } from "@/lib/csrf";

interface Props {
  onSave: (msg: string) => void;
  activeEventId: string;
  tenantId?: string | null;
}

// Classification label/color mapping
const CLASS_META: Record<PhotoClassification | "all" | "unclassified", { label: string; color: string; bg: string }> = {
  all:          { label: "全て",           color: "text-gray-700",   bg: "bg-gray-100" },
  portrait:     { label: "個人",           color: "text-blue-700",   bg: "bg-blue-100" },
  group:        { label: "グループ",       color: "text-green-700",  bg: "bg-green-100" },
  venue:        { label: "会場",           color: "text-purple-700", bg: "bg-purple-100" },
  activity:     { label: "アクティビティ", color: "text-orange-700", bg: "bg-orange-100" },
  other:        { label: "その他",         color: "text-gray-600",   bg: "bg-gray-200" },
  unclassified: { label: "未分類",         color: "text-gray-400",   bg: "bg-gray-50" },
};

const FILTER_KEYS: (PhotoClassification | "all" | "unclassified")[] = [
  "all", "portrait", "group", "venue", "activity", "other", "unclassified",
];

export default function PhotosTab({ onSave, activeEventId, tenantId }: Props) {
  const [events, setEvts] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [filter, setFilter] = useState<PhotoClassification | "all" | "unclassified">("all");
  const [classifying, setClassifying] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState({ current: 0, total: 0 });
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

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
    persistEvents(updated);
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
    persistEvents(updated);
    onSave("写真を削除しました");
  };

  // --- Classification ---

  /** Classify a single photo via API */
  const classifyOne = async (imageUrl: string): Promise<{ classification: PhotoClassification; confidence: number } | null> => {
    try {
      const res = await fetch("/api/classify-photo", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ imageUrl }),
      });
      if (res.status === 503) {
        setApiAvailable(false);
        return null;
      }
      if (!res.ok) return null;
      setApiAvailable(true);
      return await res.json();
    } catch {
      return null;
    }
  };

  /** Auto-classify all unclassified photos in the selected event */
  const handleAutoClassify = async () => {
    if (!selectedEvent || classifying) return;

    const unclassified = selectedEvent.photos.filter((p) => !p.classification);
    if (unclassified.length === 0) {
      onSave("全写真が分類済みです");
      return;
    }

    setClassifying(true);
    setClassifyProgress({ current: 0, total: unclassified.length });

    let currentEvents = [...events];
    let classified = 0;

    for (let i = 0; i < unclassified.length; i++) {
      setClassifyProgress({ current: i + 1, total: unclassified.length });

      const photo = unclassified[i];
      // Use thumbnail for cheaper/faster classification
      const result = await classifyOne(photo.thumbnailUrl);

      if (result) {
        classified++;
        currentEvents = currentEvents.map((e) =>
          e.id === selectedEventId
            ? {
                ...e,
                photos: e.photos.map((p) =>
                  p.id === photo.id
                    ? { ...p, classification: result.classification, classificationConfidence: result.confidence }
                    : p
                ),
              }
            : e
        );
        // Persist after each classification so progress isn't lost
        persistEvents(currentEvents);
      } else if (apiAvailable === false) {
        // API not available — stop trying
        break;
      }
    }

    setClassifying(false);
    setClassifyProgress({ current: 0, total: 0 });
    onSave(
      apiAvailable === false
        ? "ANTHROPIC_API_KEY が未設定です。手動分類をご利用ください"
        : `${classified}枚を自動分類しました`
    );
  };

  /** Manually set classification for a photo */
  const handleManualClassify = (photoId: string, cls: PhotoClassification) => {
    const updated = events.map((e) =>
      e.id === selectedEventId
        ? {
            ...e,
            photos: e.photos.map((p) =>
              p.id === photoId
                ? { ...p, classification: cls, classificationConfidence: 1.0 }
                : p
            ),
          }
        : e
    );
    persistEvents(updated);
  };

  /** Clear classification for a photo */
  const handleClearClassification = (photoId: string) => {
    const updated = events.map((e) =>
      e.id === selectedEventId
        ? {
            ...e,
            photos: e.photos.map((p) =>
              p.id === photoId
                ? { ...p, classification: undefined, classificationConfidence: undefined }
                : p
            ),
          }
        : e
    );
    persistEvents(updated);
  };

  // --- Filtered photos ---
  const photos = selectedEvent?.photos ?? [];
  const filteredPhotos =
    filter === "all"
      ? photos
      : filter === "unclassified"
        ? photos.filter((p) => !p.classification)
        : photos.filter((p) => p.classification === filter);

  // Classification counts for filter badges
  const counts: Record<string, number> = { all: photos.length, unclassified: 0 };
  for (const p of photos) {
    if (!p.classification) {
      counts.unclassified++;
    } else {
      counts[p.classification] = (counts[p.classification] || 0) + 1;
    }
  }

  return (
    <div className="space-y-4" data-testid="admin-photos">
      <h2 className="text-lg font-bold text-gray-800">写真管理</h2>

      <Card>
        <label className="text-sm font-bold text-gray-600 mb-2 block">対象イベント</label>
        <select
          value={selectedEventId}
          onChange={(e) => { setSelectedEventId(e.target.value); setFilter("all"); }}
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

      {/* Classification controls */}
      {selectedEvent && photos.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-700 text-sm">AI写真分類</h3>
            <div className="flex items-center gap-2">
              {classifying ? (
                <div className="flex items-center gap-2 text-xs text-blue-600">
                  <span className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full" aria-hidden="true" />
                  分類中... ({classifyProgress.current}/{classifyProgress.total})
                </div>
              ) : (
                <button
                  onClick={handleAutoClassify}
                  disabled={counts.unclassified === 0}
                  aria-label="未分類写真を一括AI分類"
                  className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium hover:from-blue-600 hover:to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                >
                  一括AI分類 ({counts.unclassified}枚)
                </button>
              )}
            </div>
          </div>

          {apiAvailable === false && (
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg mb-3">
              ANTHROPIC_API_KEY が未設定のため自動分類は利用できません。写真をクリックして手動分類してください。
            </p>
          )}

          {/* Classification progress bar */}
          {classifying && classifyProgress.total > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
              <div
                className="bg-gradient-to-r from-blue-400 to-purple-400 h-1.5 rounded-full transition-all"
                style={{ width: `${(classifyProgress.current / classifyProgress.total) * 100}%` }}
              />
            </div>
          )}

          {/* Filter pills */}
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="写真分類フィルター">
            {FILTER_KEYS.map((key) => {
              const meta = CLASS_META[key];
              const count = counts[key] || 0;
              const active = filter === key;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  role="radio"
                  aria-checked={active}
                  aria-label={`${meta.label} (${count}枚)`}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                    active
                      ? `${meta.bg} ${meta.color} ring-1 ring-current`
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {meta.label} {count > 0 && <span className="ml-0.5 opacity-70">{count}</span>}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Photo grid */}
      {selectedEvent && filteredPhotos.length > 0 && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">
            {filter === "all" ? "登録済み写真" : CLASS_META[filter].label} ({filteredPhotos.length}枚)
          </h3>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
            {filteredPhotos.map((p) => (
              <div key={p.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumbnailUrl}
                  alt={p.id}
                  className="w-full aspect-[4/3] object-cover rounded-lg"
                />

                {/* Classification badge */}
                {p.classification && (
                  <span
                    className={`absolute bottom-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${CLASS_META[p.classification].bg} ${CLASS_META[p.classification].color}`}
                  >
                    {CLASS_META[p.classification].label}
                  </span>
                )}

                {/* Hover overlay with manual classification + delete */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex flex-col gap-1 items-center">
                    {/* Manual classification buttons */}
                    <div className="flex gap-0.5 flex-wrap justify-center">
                      {(["portrait", "group", "venue", "activity", "other"] as PhotoClassification[]).map((cls) => (
                        <button
                          key={cls}
                          onClick={() => handleManualClassify(p.id, cls)}
                          aria-label={`${CLASS_META[cls].label}に分類`}
                          className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white ${
                            p.classification === cls
                              ? `${CLASS_META[cls].bg} ${CLASS_META[cls].color}`
                              : "bg-white/80 text-gray-600 hover:bg-white"
                          }`}
                        >
                          {CLASS_META[cls].label}
                        </button>
                      ))}
                    </div>

                    {/* Clear + Delete */}
                    <div className="flex gap-1 mt-0.5">
                      {p.classification && (
                        <button
                          onClick={() => handleClearClassification(p.id)}
                          aria-label="分類をクリア"
                          className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/80 text-gray-500 hover:bg-white font-medium focus:outline-none focus-visible:ring-1 focus-visible:ring-white"
                        >
                          クリア
                        </button>
                      )}
                      {!IS_DEMO_MODE && (
                        <button
                          onClick={() => removePhoto(p.id)}
                          aria-label={`写真${p.id}を削除`}
                          className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-500 text-white hover:bg-red-600 font-medium focus:outline-none focus-visible:ring-1 focus-visible:ring-white"
                        >
                          削除
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty state */}
      {selectedEvent && photos.length > 0 && filteredPhotos.length === 0 && (
        <Card>
          <p className="text-sm text-gray-400 text-center py-6">
            「{CLASS_META[filter].label}」の写真はありません
          </p>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import Card from "@/components/ui/Card";
import { EventData, PhotoClassification, PhotoData, FaceGroup } from "@/lib/types";
import { getStoredEvents, setStoredEvents, getEventsForTenant, getFaceGroups, setFaceGroups } from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";
import { logAudit } from "@/lib/audit";
import { inputCls, uploadFileToR2, createThumbnailBlobAR, readAsDataUrl, resizeImageBlob, validateImageFiles } from "./adminUtils";
import { csrfHeaders } from "@/lib/csrf";
import { indexBatchPhotoFaces } from "@/lib/faceIndex";

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
  const [scoring, setScoring] = useState(false);
  const [scoreProgress, setScoreProgress] = useState({ current: 0, total: 0 });
  const [detecting, setDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState({ current: 0, total: 0 });
  const [grouping, setGrouping] = useState(false);
  const [faceGroups, setFaceGroupsState] = useState<FaceGroup[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploadFileNames, setUploadFileNames] = useState<string[]>([]);
  const [faceIndexing, setFaceIndexing] = useState(false);
  const [faceIndexProgress, setFaceIndexProgress] = useState({ current: 0, total: 0, faces: 0 });

  useEffect(() => {
    const evts = tenantId ? getEventsForTenant(tenantId) : getStoredEvents();
    setEvts(evts);
    if (activeEventId && evts.find((e) => e.id === activeEventId)) {
      setSelectedEventId(activeEventId);
    } else if (evts.length > 0) {
      setSelectedEventId(evts[0].id);
    }
  }, [activeEventId, tenantId]);

  useEffect(() => {
    if (selectedEventId) {
      setFaceGroupsState(getFaceGroups(selectedEventId));
    }
  }, [selectedEventId]);

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
    // Pre-compute timestamp so all photos in this batch share the same prefix,
    // ensuring IDs match the face_embedding format: uploaded-{timestamp}-{index}
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

    // Fire-and-forget: index faces in uploaded photos (background)
    if (newPhotos.length > 0) {
      setFaceIndexing(true);
      setFaceIndexProgress({ current: 0, total: newPhotos.length, faces: 0 });
      indexBatchPhotoFaces(
        newPhotos.map((p) => ({ imageUrl: p.originalUrl, eventId: selectedEventId, photoId: p.id })),
        (cur, tot, faces) => setFaceIndexProgress({ current: cur, total: tot, faces }),
      ).then((result) => {
        setFaceIndexing(false);
        if (result.indexed > 0) {
          onSave(`顔インデックス完了: ${result.indexed}件の顔を検出`);
        }
      }).catch(() => setFaceIndexing(false));
    }
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

  /** Score a single photo's quality via API */
  const scoreOne = async (imageUrl: string): Promise<{ total: number } | null> => {
    try {
      const res = await fetch("/api/score-photo", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ imageUrl }),
      });
      if (res.status === 503) return null;
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  /** Auto-score all unscored photos in the selected event */
  const handleAutoScore = async () => {
    if (!selectedEvent || scoring) return;
    const unscored = selectedEvent.photos.filter((p) => p.qualityScore === undefined);
    if (unscored.length === 0) {
      onSave("全写真がスコアリング済みです");
      return;
    }
    setScoring(true);
    setScoreProgress({ current: 0, total: unscored.length });
    let currentEvents = [...events];
    let scored = 0;
    for (let i = 0; i < unscored.length; i++) {
      setScoreProgress({ current: i + 1, total: unscored.length });
      const photo = unscored[i];
      const result = await scoreOne(photo.thumbnailUrl);
      if (result) {
        scored++;
        currentEvents = currentEvents.map((e) =>
          e.id === selectedEventId
            ? { ...e, photos: e.photos.map((p) => p.id === photo.id ? { ...p, qualityScore: result.total } : p) }
            : e
        );
        persistEvents(currentEvents);
      } else {
        break; // API not available
      }
    }
    setScoring(false);
    setScoreProgress({ current: 0, total: 0 });
    onSave(scored > 0 ? `${scored}枚の品質スコアリングが完了しました` : "GEMINI_API_KEY が未設定のためスコアリングできません");
    if (scored > 0) logAudit("photo_score", { type: "photo", id: selectedEventId, name: selectedEvent?.name }, { scored });
  };

  /** Detect faces in a single photo */
  const detectFacesOne = async (imageUrl: string): Promise<{ faceCount: number; descriptions: string[] } | null> => {
    try {
      const res = await fetch("/api/detect-faces", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ imageUrl }),
      });
      if (res.status === 503) return null;
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  /** Auto-detect faces in all undetected photos */
  const handleFaceDetect = async () => {
    if (!selectedEvent || detecting) return;
    const undetected = selectedEvent.photos.filter((p) => p.faceCount === undefined);
    if (undetected.length === 0) {
      onSave("全写真が顔検出済みです");
      return;
    }
    setDetecting(true);
    setDetectProgress({ current: 0, total: undetected.length });
    let currentEvents = [...events];
    let detected = 0;
    for (let i = 0; i < undetected.length; i++) {
      setDetectProgress({ current: i + 1, total: undetected.length });
      const photo = undetected[i];
      const result = await detectFacesOne(photo.thumbnailUrl);
      if (result) {
        detected++;
        currentEvents = currentEvents.map((e) =>
          e.id === selectedEventId
            ? { ...e, photos: e.photos.map((p) => p.id === photo.id ? { ...p, faceCount: result.faceCount, faceDescriptions: result.descriptions } : p) }
            : e
        );
        persistEvents(currentEvents);
      } else {
        break;
      }
    }
    setDetecting(false);
    setDetectProgress({ current: 0, total: 0 });
    onSave(detected > 0 ? `${detected}枚の顔検出が完了しました` : "GEMINI_API_KEY が未設定のため顔検出できません");
  };

  /** Group photos by detected faces via API */
  const handleFaceGroup = async () => {
    if (!selectedEvent || grouping) return;
    const withFaces = selectedEvent.photos.filter((p) => p.faceCount && p.faceCount > 0 && p.faceDescriptions);
    if (withFaces.length === 0) {
      onSave("顔が検出された写真がありません。先に顔検出を実行してください");
      return;
    }
    setGrouping(true);
    try {
      const res = await fetch("/api/group-faces", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          photos: withFaces.map((p) => ({ photoId: p.id, descriptions: p.faceDescriptions })),
        }),
      });
      if (!res.ok) {
        onSave("グルーピングに失敗しました");
        setGrouping(false);
        return;
      }
      const data = await res.json();
      const groups: FaceGroup[] = data.groups || [];

      // Save face groups
      setFaceGroups(selectedEventId, groups);
      setFaceGroupsState(groups);

      // Update photo faceGroupId
      let currentEvents = [...events];
      currentEvents = currentEvents.map((e) => {
        if (e.id !== selectedEventId) return e;
        return {
          ...e,
          photos: e.photos.map((p) => {
            const group = groups.find((g) => g.photoIds.includes(p.id));
            return group ? { ...p, faceGroupId: group.id } : p;
          }),
        };
      });
      persistEvents(currentEvents);
      onSave(`${groups.length}グループに分類しました`);
      logAudit("photo_classify", { type: "photo", id: selectedEventId, name: selectedEvent?.name }, { groups: groups.length, action: "face_group" });
    } catch {
      onSave("グルーピングに失敗しました");
    }
    setGrouping(false);
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
        ? "GEMINI_API_KEY が未設定です。手動分類をご利用ください"
        : `${classified}枚を自動分類しました`
    );
    if (classified > 0) logAudit("photo_classify", { type: "photo", id: selectedEventId, name: selectedEvent?.name }, { classified });
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

            {/* Face indexing progress */}
            {faceIndexing && (
              <div className="mt-3 flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
                <span className="animate-pulse">🧠</span>
                <span>顔インデックス中... ({faceIndexProgress.current}/{faceIndexProgress.total} 写真, {faceIndexProgress.faces}件検出)</span>
                <div className="flex-1 h-1.5 bg-purple-100 dark:bg-purple-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{ width: `${faceIndexProgress.total > 0 ? (faceIndexProgress.current / faceIndexProgress.total) * 100 : 0}%` }}
                  />
                </div>
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
              GEMINI_API_KEY が未設定のため自動分類は利用できません。写真をクリックして手動分類してください。
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

          {/* Quality scoring controls */}
          <div className="flex items-center justify-between mb-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm">品質スコアリング</h3>
            <div className="flex items-center gap-2">
              {scoring ? (
                <div className="flex items-center gap-2 text-xs text-blue-600">
                  <span className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full" aria-hidden="true" />
                  採点中... ({scoreProgress.current}/{scoreProgress.total})
                </div>
              ) : (
                <button
                  onClick={handleAutoScore}
                  disabled={!selectedEvent || selectedEvent.photos.filter((p) => p.qualityScore === undefined).length === 0}
                  aria-label="未採点写真を一括品質スコアリング"
                  className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-medium hover:from-yellow-600 hover:to-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  一括スコアリング ({selectedEvent ? selectedEvent.photos.filter((p) => p.qualityScore === undefined).length : 0}枚)
                </button>
              )}
            </div>
          </div>

          {/* Scoring progress bar */}
          {scoring && scoreProgress.total > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
              <div
                className="bg-gradient-to-r from-yellow-400 to-orange-400 h-1.5 rounded-full transition-all"
                style={{ width: `${(scoreProgress.current / scoreProgress.total) * 100}%` }}
              />
            </div>
          )}

          {/* Face detection & grouping controls */}
          <div className="flex items-center justify-between mb-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm">顔検出＆グルーピング</h3>
            <div className="flex items-center gap-2">
              {detecting ? (
                <div className="flex items-center gap-2 text-xs text-blue-600">
                  <span className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full" aria-hidden="true" />
                  検出中... ({detectProgress.current}/{detectProgress.total})
                </div>
              ) : (
                <button
                  onClick={handleFaceDetect}
                  disabled={!selectedEvent || selectedEvent.photos.filter((p) => p.faceCount === undefined).length === 0}
                  aria-label="未検出写真の顔を一括検出"
                  className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:from-cyan-600 hover:to-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  顔検出 ({selectedEvent ? selectedEvent.photos.filter((p) => p.faceCount === undefined).length : 0}枚)
                </button>
              )}
              {grouping ? (
                <div className="flex items-center gap-2 text-xs text-purple-600">
                  <span className="animate-spin h-3 w-3 border-2 border-purple-500 border-t-transparent rounded-full" aria-hidden="true" />
                  グルーピング中...
                </div>
              ) : (
                <button
                  onClick={handleFaceGroup}
                  disabled={!selectedEvent || selectedEvent.photos.filter((p) => p.faceCount && p.faceCount > 0).length === 0}
                  aria-label="検出済み写真を人物別にグルーピング"
                  className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:from-purple-600 hover:to-pink-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                >
                  グルーピング
                </button>
              )}
            </div>
          </div>

          {/* Face detection progress bar */}
          {detecting && detectProgress.total > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
              <div
                className="bg-gradient-to-r from-cyan-400 to-blue-400 h-1.5 rounded-full transition-all"
                style={{ width: `${(detectProgress.current / detectProgress.total) * 100}%` }}
              />
            </div>
          )}

          {/* Face groups display */}
          {faceGroups.length > 0 && (
            <div className="mb-3 pt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">検出グループ ({faceGroups.length}人)</p>
              <div className="flex flex-wrap gap-1.5">
                {faceGroups.map((g) => (
                  <span
                    key={g.id}
                    className="text-[10px] px-2 py-1 rounded-full bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 font-medium"
                  >
                    {g.label} ({g.photoIds.length}枚)
                  </span>
                ))}
              </div>
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

                {/* Face count badge */}
                {p.faceCount !== undefined && p.faceCount > 0 && (
                  <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-cyan-100 text-cyan-700 shadow-sm">
                    {p.faceCount}人
                  </span>
                )}

                {/* Quality score badge */}
                {p.qualityScore !== undefined && (
                  <span
                    className={`absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold shadow-sm ${
                      p.qualityScore >= 80
                        ? "bg-yellow-400 text-yellow-900"
                        : p.qualityScore >= 50
                          ? "bg-gray-200 text-gray-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {p.qualityScore}点
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

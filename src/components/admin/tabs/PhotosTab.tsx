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
  const [reindexing, setReindexing] = useState(false);
  const [serverReindexing, setServerReindexing] = useState(false);
  const [serverReindexProgress, setServerReindexProgress] = useState({ current: 0, total: 0 });
  // Face search accuracy test state
  const [testSearchFile, setTestSearchFile] = useState<File | null>(null);
  const [testSearchDetecting, setTestSearchDetecting] = useState(false);
  const [testSearchResults, setTestSearchResults] = useState<{
    faces: Array<{ index: number; bbox: { x: number; y: number; width: number; height: number }; embedding: number[] }>;
    searchResults: Array<{
      faceIndex: number;
      matchCount: number;
      uniquePhotos: number;
      totalEmbeddings: number;
      scoreDistribution: { excellent: number; good: number; fair: number; poor: number };
    }>;
  } | null>(null);
  const [testThreshold, setTestThreshold] = useState(0.5);

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

  /** Delete all face embeddings for event then re-index all photos */
  const handleFaceReindex = async () => {
    if (!selectedEvent || reindexing || faceIndexing) return;
    if (!window.confirm(`イベント「${selectedEvent.name}」の顔インデックスをすべて削除して再構築しますか？\n写真 ${selectedEvent.photos.length} 枚を再解析します。`)) return;

    setReindexing(true);
    try {
      await fetch("/api/face/reindex", {
        method: "DELETE",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ eventId: selectedEventId }),
      });
    } catch {
      // ignore delete errors, proceed with reindex
    }
    setReindexing(false);

    const allPhotos = selectedEvent.photos.filter((p) => p.originalUrl);
    if (allPhotos.length === 0) return;

    setFaceIndexing(true);
    setFaceIndexProgress({ current: 0, total: allPhotos.length, faces: 0 });
    indexBatchPhotoFaces(
      allPhotos.map((p) => ({ imageUrl: p.originalUrl, eventId: selectedEventId, photoId: p.id })),
      (cur, tot, faces) => setFaceIndexProgress({ current: cur, total: tot, faces }),
    ).then((result) => {
      setFaceIndexing(false);
      onSave(`顔インデックス再構築完了: ${result.indexed}件の顔を検出`);
    }).catch(() => setFaceIndexing(false));
  };

  /** Server-side reindex: calls /api/face/reindex-server which uses Node.js + canvas */
  const handleServerReindex = async () => {
    if (!selectedEvent || serverReindexing || faceIndexing) return;
    if (!window.confirm(
      `イベント「${selectedEvent.name}」の顔インデックスをサーバーサイドで再構築しますか？\n` +
      `写真 ${selectedEvent.photos.length} 枚を Node.js + canvas で再解析します。\n` +
      `（クライアントブラウザ不要、より安定した処理が可能です）`
    )) return;

    const allPhotos = selectedEvent.photos.filter((p) => p.originalUrl);
    if (allPhotos.length === 0) {
      onSave("写真がありません");
      return;
    }

    setServerReindexing(true);
    setServerReindexProgress({ current: 0, total: allPhotos.length });

    try {
      // Process in batches of 10 to avoid timeout
      const BATCH_SIZE = 10;
      let totalIndexed = 0;

      for (let batchStart = 0; batchStart < allPhotos.length; batchStart += BATCH_SIZE) {
        const batch = allPhotos.slice(batchStart, batchStart + BATCH_SIZE);
        const isFirstBatch = batchStart === 0;

        const res = await fetch("/api/face/reindex-server", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            eventId: selectedEventId,
            photos: batch.map((p) => ({ photoId: p.id, url: p.originalUrl })),
            deleteFirst: isFirstBatch, // Only delete on first batch
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          onSave(`サーバーサイド再構築エラー: ${err.error || res.statusText}`);
          setServerReindexing(false);
          setServerReindexProgress({ current: 0, total: 0 });
          return;
        }

        const data = await res.json();
        totalIndexed += data.indexed ?? 0;
        setServerReindexProgress({ current: Math.min(batchStart + BATCH_SIZE, allPhotos.length), total: allPhotos.length });
      }

      onSave(`サーバーサイド再構築完了: ${totalIndexed}件の顔を検出`);
      logAudit("face_reindex_server", { type: "photo", id: selectedEventId, name: selectedEvent?.name }, { indexed: totalIndexed });
    } catch (err) {
      onSave(`サーバーサイド再構築エラー: ${String(err)}`);
    }

    setServerReindexing(false);
    setServerReindexProgress({ current: 0, total: 0 });
  };

  /** Face search accuracy test: detect faces in uploaded image, search D1, show results */
  const handleFaceSearchTest = async () => {
    if (!testSearchFile || !selectedEvent || testSearchDetecting) return;

    setTestSearchDetecting(true);
    setTestSearchResults(null);

    try {
      // Load face-api in browser and detect faces in the uploaded image
      const { indexPhotoFaces } = await import("@/lib/faceIndex");
      const faceapi = await import("@vladmandic/face-api");

      // Load models if not loaded
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
        await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
        await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
      } catch {
        // Models may already be loaded
      }

      // Load image
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(testSearchFile);
      });

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = imageUrl;
      });

      // Detect faces with embeddings
      const detections = await faceapi
        .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (detections.length === 0) {
        onSave("テスト画像に顔が検出されませんでした");
        setTestSearchDetecting(false);
        return;
      }

      const faces = detections.map((d, i) => ({
        index: i,
        bbox: {
          x: Math.round(d.detection.box.x),
          y: Math.round(d.detection.box.y),
          width: Math.round(d.detection.box.width),
          height: Math.round(d.detection.box.height),
        },
        embedding: Array.from(d.descriptor) as number[],
      }));

      // Search D1 for each detected face
      const searchResults = await Promise.all(
        faces.map(async (face) => {
          const res = await fetch("/api/face/search", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              eventId: selectedEventId,
              queryEmbedding: face.embedding,
              threshold: testThreshold,
              limit: 100,
            }),
          });
          if (!res.ok) {
            return {
              faceIndex: face.index,
              matchCount: 0,
              uniquePhotos: 0,
              totalEmbeddings: 0,
              scoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
            };
          }
          const data = await res.json();
          // Compute score distribution from search results
          const results = (data.results || []) as Array<{ similarity: number }>;
          const scoreDistribution = { excellent: 0, good: 0, fair: 0, poor: 0 };
          for (const r of results) {
            if (r.similarity >= 0.7) scoreDistribution.excellent++;
            else if (r.similarity >= 0.5) scoreDistribution.good++;
            else if (r.similarity >= 0.3) scoreDistribution.fair++;
            else scoreDistribution.poor++;
          }
          return {
            faceIndex: face.index,
            matchCount: data.matchCount ?? 0,
            uniquePhotos: data.uniquePhotos ?? 0,
            totalEmbeddings: results.length,
            scoreDistribution,
          };
        })
      );

      setTestSearchResults({ faces, searchResults });
      void indexPhotoFaces; // suppress unused warning
    } catch (err) {
      onSave(`顔検索テストエラー: ${String(err)}`);
    }

    setTestSearchDetecting(false);
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

          {/* Face reindex controls */}
          <div className="flex items-center justify-between mb-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div>
              <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm">顔インデックス再構築</h3>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">全写真の顔 embedding を削除して再生成します</p>
            </div>
            {reindexing || faceIndexing ? (
              <div className="flex items-center gap-2 text-xs text-purple-600">
                <span className="animate-spin h-3 w-3 border-2 border-purple-500 border-t-transparent rounded-full" aria-hidden="true" />
                {reindexing ? "削除中..." : `再インデックス中... (${faceIndexProgress.current}/${faceIndexProgress.total})`}
              </div>
            ) : (
              <button
                onClick={handleFaceReindex}
                disabled={!selectedEvent || selectedEvent.photos.length === 0}
                aria-label="顔インデックスを削除して全写真を再インデックス"
                className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-orange-500 text-white font-medium hover:from-rose-600 hover:to-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                再構築 ({selectedEvent ? selectedEvent.photos.length : 0}枚)
              </button>
            )}
          </div>

          {/* Server-side reindex controls */}
          <div className="flex items-center justify-between mb-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div>
              <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm">サーバーサイド再構築</h3>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Node.js + canvas で embedding を生成（より安定・高精度）</p>
            </div>
            {serverReindexing ? (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2 text-xs text-indigo-600">
                  <span className="animate-spin h-3 w-3 border-2 border-indigo-500 border-t-transparent rounded-full" aria-hidden="true" />
                  処理中... ({serverReindexProgress.current}/{serverReindexProgress.total})
                </div>
                {serverReindexProgress.total > 0 && (
                  <div className="w-32 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${(serverReindexProgress.current / serverReindexProgress.total) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={handleServerReindex}
                disabled={!selectedEvent || selectedEvent.photos.length === 0 || faceIndexing}
                aria-label="サーバーサイドで顔インデックスを再構築"
                className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-medium hover:from-indigo-600 hover:to-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                SSR再構築 ({selectedEvent ? selectedEvent.photos.length : 0}枚)
              </button>
            )}
          </div>

          {/* Face search accuracy test */}
          <div className="mb-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-2">顔検索精度テスト</h3>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
              テスト画像をアップロードして顔を検出し、D1インデックスとのマッチ精度を確認します
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="text-xs text-gray-600 file:mr-2 file:text-xs file:px-2 file:py-1 file:rounded file:border-0 file:bg-gray-100 file:text-gray-600 hover:file:bg-gray-200"
                onChange={(e) => {
                  setTestSearchFile(e.target.files?.[0] ?? null);
                  setTestSearchResults(null);
                }}
              />
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <span>閾値:</span>
                <input
                  type="number"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={testThreshold}
                  onChange={(e) => setTestThreshold(parseFloat(e.target.value))}
                  className="w-16 px-1.5 py-0.5 border border-gray-200 rounded text-xs"
                />
              </div>
              {testSearchDetecting ? (
                <div className="flex items-center gap-1 text-xs text-teal-600">
                  <span className="animate-spin h-3 w-3 border-2 border-teal-500 border-t-transparent rounded-full" aria-hidden="true" />
                  検出・検索中...
                </div>
              ) : (
                <button
                  onClick={handleFaceSearchTest}
                  disabled={!testSearchFile || !selectedEvent}
                  aria-label="テスト画像で顔検索精度を確認"
                  className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-medium hover:from-teal-600 hover:to-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                >
                  テスト実行
                </button>
              )}
            </div>

            {/* Test results */}
            {testSearchResults && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  検出顔数: {testSearchResults.faces.length}
                </p>
                {testSearchResults.searchResults.map((sr) => (
                  <div key={sr.faceIndex} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-700 dark:text-gray-200">顔 #{sr.faceIndex + 1}</span>
                      <span className={`px-1.5 py-0.5 rounded-full font-medium ${sr.matchCount > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {sr.matchCount}件マッチ / {sr.uniquePhotos}枚
                      </span>
                      <span className="text-gray-400">（インデックス総数: {sr.totalEmbeddings}件）</span>
                    </div>
                    <div className="flex gap-2 text-[10px]">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        優 {sr.scoreDistribution.excellent}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                        良 {sr.scoreDistribution.good}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                        可 {sr.scoreDistribution.fair}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-300 inline-block" />
                        不可 {sr.scoreDistribution.poor}
                      </span>
                    </div>
                    {sr.totalEmbeddings === 0 && (
                      <p className="text-amber-600 mt-1">インデックスが空です。先に顔インデックス再構築を実行してください。</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

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

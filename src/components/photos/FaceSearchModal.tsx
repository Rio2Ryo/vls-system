"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getCsrfToken } from "@/lib/csrf";
import { DEFAULT_WATERMARK_CONFIG, WatermarkConfig } from "@/lib/types";
import { getWatermarkConfig } from "@/lib/store";


interface FaceSearchResult {
  photoId: string;
  faceId: string;
  similarity: number;
  matchPercent?: number;
  bbox?: { x: number; y: number; width: number; height: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventName?: string;
  onResults: (photoIds: string[]) => void;
  allPhotos?: { id: string; originalUrl?: string; url?: string; thumbnailUrl?: string }[];
}

type Step = "select" | "loading" | "results" | "error";
type SearchMode = "recommended" | "strict" | "broad";

const MAX_RESULTS = 12;
const DEFAULT_THRESHOLD = 0.6;

let faceApiLoaded = false;

async function loadFaceApi() {
  const faceapi = await import("@vladmandic/face-api");
  if (!faceApiLoaded) {
    await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
    await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
    await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
    faceApiLoaded = true;
  }
  return faceapi;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function resizeImage(url: string, maxSize = 800): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

function extractFaceThumbnail(imageUrl: string, bbox: { x: number; y: number; width: number; height: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const padding = 0.3;
      const srcX = Math.max(0, Math.floor(bbox.x - bbox.width * padding));
      const srcY = Math.max(0, Math.floor(bbox.y - bbox.height * padding));
      const srcW = Math.floor(bbox.width * (1 + padding * 2));
      const srcH = Math.floor(bbox.height * (1 + padding * 2));
      canvas.width = srcW;
      canvas.height = srcH;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("No context")); return; }
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, config: Omit<WatermarkConfig, "tenantId">) {
  if (!config.enabled || !config.text) return;
  ctx.save();
  ctx.globalAlpha = config.opacity;
  ctx.fillStyle = config.fontColor;
  const fontSize = Math.max((config.fontSize * w) / 600, 10);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (config.position === "tile") {
    const rad = (config.rotation * Math.PI) / 180;
    ctx.save();
    ctx.rotate(rad);
    const cols = config.gridCols || 3;
    const rows = config.gridRows || 3;
    const stepX = (w * 1.5) / cols;
    const stepY = (h * 1.5) / rows;
    const offsetX = -w * 0.25;
    const offsetY = -h * 0.25;
    for (let r = 0; r <= rows + 1; r++) {
      for (let c = 0; c <= cols + 1; c++) {
        ctx.fillText(config.text, offsetX + c * stepX, offsetY + r * stepY);
      }
    }
    ctx.restore();
  } else {
    let x = w / 2;
    let y = h / 2;
    ctx.textAlign = "center";
    if (config.position === "bottom-right") { x = w - fontSize * 2; y = h - fontSize; ctx.textAlign = "right"; }
    else if (config.position === "bottom-left") { x = fontSize * 2; y = h - fontSize; ctx.textAlign = "left"; }
    else if (config.position === "top-right") { x = w - fontSize * 2; y = fontSize * 1.5; ctx.textAlign = "right"; }
    else if (config.position === "top-left") { x = fontSize * 2; y = fontSize * 1.5; ctx.textAlign = "left"; }
    ctx.save();
    const rad = (config.rotation * Math.PI) / 180;
    ctx.translate(x, y);
    ctx.rotate(rad);
    ctx.shadowColor = "rgba(255,255,255,0.5)";
    ctx.shadowBlur = 4;
    ctx.fillText(config.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function WatermarkedPhoto({ src, wmConfig, className, faceBbox }: { src: string; wmConfig: Omit<WatermarkConfig, "tenantId">; className?: string; faceBbox?: { x: number; y: number; width: number; height: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      drawWatermark(ctx, img.width, img.height, wmConfig);
      if (faceBbox) {
        const padding = 0.2;
        const bx = Number(faceBbox.x) || 0;
        const by = Number(faceBbox.y) || 0;
        const bw = Number(faceBbox.width) || 0;
        const bh = Number(faceBbox.height) || 0;
        if (bw > 0 && bh > 0) {
          const x = bx - bw * padding;
          const y = by - bh * padding;
          const w = bw * (1 + padding * 2);
          const h = bh * (1 + padding * 2);
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = Math.max(3, Math.min(img.width, img.height) / 100);
          ctx.setLineDash([10, 5]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
          const cornerSize = Math.max(10, Math.min(img.width, img.height) / 50);
          ctx.strokeStyle = "#60a5fa";
          ctx.lineWidth = Math.max(5, Math.min(img.width, img.height) / 50);
          ctx.beginPath(); ctx.moveTo(x, y + cornerSize); ctx.lineTo(x, y); ctx.lineTo(x + cornerSize, y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + w - cornerSize, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerSize); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y + h - cornerSize); ctx.lineTo(x, y + h); ctx.lineTo(x + cornerSize, y + h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + w - cornerSize, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cornerSize); ctx.stroke();
        }
      }
    };
    img.src = src;
  }, [src, wmConfig, faceBbox]);
  return <canvas ref={canvasRef} className={className} />;
}

function getMatchLevel(similarity: number): { label: string; color: string; bg: string } {
  if (similarity >= 0.7) return { label: "高一致", color: "text-green-700", bg: "bg-green-100" };
  if (similarity >= 0.6) return { label: "中一致", color: "text-yellow-700", bg: "bg-yellow-100" };
  return { label: "低一致", color: "text-red-700", bg: "bg-red-100" };
}

export default function FaceSearchModal({ open, onClose, eventId, onResults, allPhotos = [] }: Props) {
  const [step, setStep] = useState<Step>("select");
  const [statusText, setStatusText] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [detectedFaceUrl, setDetectedFaceUrl] = useState<string | null>(null);
  const [currentFaceBbox, setCurrentFaceBbox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [allSearchResults, setAllSearchResults] = useState<FaceSearchResult[]>([]);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [searchMode, setSearchMode] = useState<SearchMode>("recommended");
  const [isVisionMode, setIsVisionMode] = useState(true);
  const [searchingMore, setSearchingMore] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const stopSearchRef = useRef(false);

  // Watermark config
  const wmConfig = useMemo(() => {
    if (typeof window === "undefined") return DEFAULT_WATERMARK_CONFIG;
    const tenantId = sessionStorage.getItem("adminTenantId") || sessionStorage.getItem("tenantId") || "default";
    return getWatermarkConfig(tenantId);
  }, []);
  const streamRef = useRef<MediaStream | null>(null);

  // Filter and sort results, deduplicate by photoId, limit to MAX_RESULTS
  const filteredResults = useMemo(() => {
    const seen = new Set<string>();
    const minSimilarity = isVisionMode
      ? searchMode === "strict" ? 0.7 : searchMode === "broad" ? 0 : 0.6
      : threshold;
    return allSearchResults
      .filter((r) => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .filter((r) => {
        if (seen.has(r.photoId)) return false;
        seen.add(r.photoId);
        return true;
      })
      .slice(0, MAX_RESULTS);
  }, [allSearchResults, threshold, searchMode, isVisionMode]);

  const matchPhotos = useMemo(() => filteredResults.map((r) => r.photoId), [filteredResults]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Cleanup camera on close
  useEffect(() => {
    if (!open) {
      stopCamera();
      setStep("select");
      setPreviewUrl(null);
      setAllSearchResults([]);
      setDetectedFaceUrl(null);
      setCurrentFaceBbox(null);
      setShowPhotoPreview(false);
      setCurrentPhotoIndex(0);
      setThreshold(DEFAULT_THRESHOLD);
      setSearchMode("recommended");
      setIsVisionMode(true);
      setSearchingMore(false);
      setSearchProgress(null);
    }
  }, [open, stopCamera]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setStep("error");
      setStatusText("カメラへのアクセスが拒否されました");
    }
  };

  const captureFromCamera = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    stopCamera();
    setPreviewUrl(dataUrl);
    processImage(dataUrl);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);
      processImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const processImage = async (imageDataUrl: string) => {
    setStep("loading");
    setStatusText("AI Vision で写真を比較中...");
    setSearchingMore(false);
    setSearchProgress(null);
    stopSearchRef.current = false;

    const csrfToken = getCsrfToken();
    const BATCH_SIZE = 1; // 1 photo per request to stay within Vercel 60s limit

    const toResults = (ids: string[], cmap: Record<string, string>): FaceSearchResult[] =>
      ids.map((photoId) => {
        const confidence = cmap[photoId] || "medium";
        const similarity = confidence === "high" ? 0.85 : 0.65;
        return { photoId, faceId: photoId, similarity, matchPercent: Math.round(similarity * 100) };
      });

    // Client-side path: fetch + resize photos in browser, send as base64 to server
    if (allPhotos.length > 0) {
      const total = allPhotos.length;
      setSearchProgress({ done: 0, total });

      // Show results step early so user sees progress
      setIsVisionMode(true);
      setAllSearchResults([]);
      setStep("results");
      setSearchingMore(true);

      let done = 0;
      for (let i = 0; i < total && !stopSearchRef.current; i += BATCH_SIZE) {
        const batchPhotos = allPhotos.slice(i, i + BATCH_SIZE);

        // Resize photos client-side (800px max, JPEG 80%)
        const photoEntries = (
          await Promise.all(
            batchPhotos.map(async (photo) => {
              const url = photo.originalUrl || photo.url || photo.thumbnailUrl;
              if (!url) return null;
              try {
                const base64 = await resizeImage(url);
                return { id: photo.id, base64 };
              } catch {
                return null;
              }
            })
          )
        ).filter((e): e is { id: string; base64: string } => e !== null);

        if (photoEntries.length === 0) {
          done += batchPhotos.length;
          setSearchProgress({ done: Math.min(done, total), total });
          continue;
        }

        try {
          const res = await fetch("/api/face/search-vision", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
            },
            body: JSON.stringify({ imageBase64: imageDataUrl, eventId, photoEntries }),
          });

          if (res.status === 503) {
            // No Vision API key — fall back to face-api.js
            console.warn("[FaceSearch] No Vision API configured, falling back to face-api.js");
            setSearchingMore(false);
            setSearchProgress(null);
            await processImageWithFaceApi(imageDataUrl);
            return;
          }

          if (res.ok) {
            const data = await res.json();
            const ids: string[] = data.matchedPhotoIds || [];
            const cmap: Record<string, string> = data.confidenceMap || {};
            const pageResults = toResults(ids, cmap);
            setAllSearchResults((prev) => {
              const seen = new Set(prev.map((r) => r.photoId));
              const merged = [...prev, ...pageResults.filter((r) => !seen.has(r.photoId))];
              return merged.sort((a, b) => b.similarity - a.similarity);
            });
          }
        } catch (err) {
          console.warn(`[FaceSearch] batch i=${i} failed:`, err);
        }

        done += batchPhotos.length;
        setSearchProgress({ done: Math.min(done, total), total });
      }

      setSearchingMore(false);
      setSearchProgress(null);
      return;
    }

    // Fallback path: server-side photo fetching (when allPhotos not available)
    const PAGE_LIMIT = 9;
    const callSearchVision = async (offset: number, limit: number) => {
      return fetch("/api/face/search-vision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ imageBase64: imageDataUrl, eventId, offset, limit }),
      });
    };

    try {
      const res = await callSearchVision(0, PAGE_LIMIT);

      if (res.status === 503) {
        console.warn("[FaceSearch] No Vision API configured, falling back to face-api.js");
        await processImageWithFaceApi(imageDataUrl);
        return;
      }

      if (!res.ok) {
        setStep("error");
        setStatusText(`検索 API エラー: ${res.status}`);
        return;
      }

      const data = await res.json();
      const matchedPhotoIds: string[] = data.matchedPhotoIds || [];
      const confidenceMap: Record<string, string> = data.confidenceMap || {};
      const total: number = data.total || 0;

      const page1Results = toResults(matchedPhotoIds, confidenceMap);
      setIsVisionMode(true);
      setAllSearchResults(page1Results.sort((a, b) => b.similarity - a.similarity));
      setStep("results");

      if (total <= PAGE_LIMIT || stopSearchRef.current) return;

      setSearchingMore(true);
      setSearchProgress({ done: PAGE_LIMIT, total });

      let offset = PAGE_LIMIT;
      while (offset < total && !stopSearchRef.current) {
        try {
          const res2 = await callSearchVision(offset, PAGE_LIMIT);
          if (res2.ok) {
            const data2 = await res2.json();
            const ids2: string[] = data2.matchedPhotoIds || [];
            const cmap2: Record<string, string> = data2.confidenceMap || {};
            const pageResults = toResults(ids2, cmap2);
            setAllSearchResults((prev) => {
              const seen = new Set(prev.map((r) => r.photoId));
              const merged = [...prev, ...pageResults.filter((r) => !seen.has(r.photoId))];
              return merged.sort((a, b) => b.similarity - a.similarity);
            });
          }
        } catch (err) {
          console.warn(`[FaceSearch] page offset=${offset} failed:`, err);
        }
        offset += PAGE_LIMIT;
        setSearchProgress({ done: Math.min(offset, total), total });
      }
    } catch (err) {
      console.error("[FaceSearch] Vision API failed, falling back to face-api.js:", err);
      await processImageWithFaceApi(imageDataUrl);
    } finally {
      setSearchingMore(false);
      setSearchProgress(null);
    }
  };

  // Fallback: face-api.js client-side processing (used when CF AI is unavailable)
  const processImageWithFaceApi = async (imageDataUrl: string) => {
    setIsVisionMode(false);
    setStatusText("AIモデルを読み込み中...");

    const csrfToken = getCsrfToken();

    let faceapi: Awaited<ReturnType<typeof loadFaceApi>> | null = null;
    try {
      faceapi = await loadFaceApi();
    } catch (err) {
      console.error("[FaceSearch] Model load failed:", err);
      setStep("error");
      setStatusText("AIモデルの読み込みに失敗しました。ネットワーク環境をご確認ください。");
      return;
    }

    let img: HTMLImageElement;
    try {
      setStatusText("画像読込中...");
      img = await loadImage(imageDataUrl);
    } catch (err) {
      console.error("[FaceSearch] Image load failed:", err);
      setStep("error");
      setStatusText("画像の読み込みに失敗しました。別の形式の画像をお試しください。");
      return;
    }

    let detections: { descriptor: Float32Array }[] = [];
    try {
      setStatusText("顔検出中...");
      detections = await faceapi
        .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
    } catch (err) {
      console.error("[FaceSearch] Detection failed:", err);
      setStep("error");
      setStatusText("顔の検出に失敗しました。別の写真をお試しください。");
      return;
    }

    if (detections.length === 0) {
      setStep("error");
      setStatusText("顔が検出されませんでした。別の写真をお試しください。");
      return;
    }

    setStatusText(`${detections.length}件の顔を検出。検索中...`);

    const queryBox = (detections[0] as unknown as { detection: { box: { x: number; y: number; width: number; height: number } } }).detection?.box;
    if (queryBox) {
      extractFaceThumbnail(imageDataUrl, {
        x: queryBox.x,
        y: queryBox.y,
        width: queryBox.width,
        height: queryBox.height,
      }).then(setDetectedFaceUrl).catch(() => setDetectedFaceUrl(null));
    }

    const queryEmbedding = Array.from(detections[0].descriptor);
    try {
      const res = await fetch("/api/face/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({
          eventId,
          queryEmbedding,
          threshold: 0.4,
          limit: 100,
        }),
      });

      if (!res.ok) {
        setStep("error");
        setStatusText(`検索 API エラー: ${res.status}`);
        return;
      }

      const data = await res.json();
      const results = (data.results || []) as FaceSearchResult[];
      const resultsWithPercent = results
        .map((r) => ({ ...r, matchPercent: Math.round(r.similarity * 100) }))
        .sort((a, b) => b.similarity - a.similarity);

      setAllSearchResults(resultsWithPercent);
      setStep("results");
    } catch (err) {
      console.error("[FaceSearch] Search API failed:", err);
      setStep("error");
      setStatusText("検索 API への接続に失敗しました。ネットワーク環境をご確認ください。");
    }
  };

  const handleApplyResults = () => {
    onResults(matchPhotos);
    setShowPhotoPreview(true);
    setCurrentPhotoIndex(0);
  };

  const goToPhoto = useCallback((index: number) => {
    if (index < 0 || index >= matchPhotos.length) return;
    setCurrentPhotoIndex(index);
    const photoId = matchPhotos[index];
    const result = filteredResults.find(r => r.photoId === photoId);
    setCurrentFaceBbox(result?.bbox || null);
  }, [matchPhotos, filteredResults]);

  const goToNextPhoto = useCallback(() => {
    goToPhoto((currentPhotoIndex + 1) % matchPhotos.length);
  }, [currentPhotoIndex, matchPhotos.length, goToPhoto]);

  const goToPrevPhoto = useCallback(() => {
    goToPhoto((currentPhotoIndex - 1 + matchPhotos.length) % matchPhotos.length);
  }, [currentPhotoIndex, matchPhotos.length, goToPhoto]);

  useEffect(() => {
    if (!showPhotoPreview || matchPhotos.length === 0 || filteredResults.length === 0) return;
    const photoId = matchPhotos[currentPhotoIndex];
    const result = filteredResults.find(r => r.photoId === photoId);
    setCurrentFaceBbox(result?.bbox || null);
  }, [currentPhotoIndex, showPhotoPreview, matchPhotos, filteredResults]);

  useEffect(() => {
    if (!showPhotoPreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToPrevPhoto();
      else if (e.key === "ArrowRight") goToNextPhoto();
      else if (e.key === "Escape") setShowPhotoPreview(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPhotoPreview, goToPrevPhoto, goToNextPhoto]);

  const currentPhotoId = matchPhotos[currentPhotoIndex];
  const currentPhoto = allPhotos.find((p) => p.id === currentPhotoId);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">顔で写真を検索</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>

          <div className="p-6">
            {/* Step: select source */}
            {step === "select" && !cameraActive && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 text-center">
                  自撮り写真またはファイルをアップロードすると、<br />AIがあなたが写っている写真を自動で見つけます
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={startCamera}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#6EC6FF] hover:bg-blue-50 transition-all"
                  >
                    <span className="text-3xl">📷</span>
                    <span className="text-sm font-medium text-gray-700">カメラで撮影</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#6EC6FF] hover:bg-blue-50 transition-all"
                  >
                    <span className="text-3xl">🖼️</span>
                    <span className="text-sm font-medium text-gray-700">ファイル選択</span>
                  </button>
                </div>

                {/* Search mode selector (Vision API) / threshold slider (face-api fallback) */}
                {isVisionMode ? (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <span className="text-xs font-medium text-gray-600">検索モード</span>
                    <select
                      value={searchMode}
                      onChange={(e) => setSearchMode(e.target.value as SearchMode)}
                      className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6EC6FF]"
                      aria-label="検索モード"
                    >
                      <option value="recommended">🎯 おすすめ（デフォルト）</option>
                      <option value="strict">🔍 厳密</option>
                      <option value="broad">📸 幅広く</option>
                    </select>
                    <p className="text-xs text-gray-400">AIが顔の特徴を分析して自動判定します</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600">一致度の閾値</span>
                      <span className="text-xs font-bold text-gray-800">{Math.round(threshold * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.4}
                      max={0.9}
                      step={0.05}
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      className="w-full accent-[#6EC6FF]"
                      aria-label="一致度の閾値"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>40%（緩い）</span>
                      <span>90%（厳しい）</span>
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            )}

            {/* Camera view */}
            {step === "select" && cameraActive && (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 border-4 border-white/20 rounded-xl pointer-events-none" />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={stopCamera}
                    className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={captureFromCamera}
                    className="flex-1 py-2 rounded-xl bg-[#6EC6FF] text-white text-sm font-medium hover:bg-[#5ab5ee] transition-colors"
                  >
                    撮影する
                  </button>
                </div>
              </div>
            )}

            {/* Loading */}
            {step === "loading" && (
              <div className="text-center py-8 space-y-4">
                {previewUrl && (
                  <div className="w-24 h-24 mx-auto rounded-full overflow-hidden border-4 border-[#6EC6FF]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="検索顔" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="animate-pulse">
                  <div className="w-8 h-8 mx-auto border-4 border-[#6EC6FF] border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-sm text-gray-500">{statusText}</p>
                <button
                  onClick={() => { stopSearchRef.current = true; setStep("select"); setPreviewUrl(null); setAllSearchResults([]); }}
                  className="px-4 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-xs font-medium hover:bg-gray-200 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            )}

            {/* Results */}
            {step === "results" && (
              <div className="space-y-4">
                {/* Query face + summary */}
                <div className="flex items-center gap-4">
                  {(detectedFaceUrl || previewUrl) && (
                    <div className="w-14 h-14 flex-shrink-0 rounded-full overflow-hidden border-3 border-green-400 shadow">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={detectedFaceUrl || previewUrl!} alt="検索顔" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-xl font-bold text-gray-800">{matchPhotos.length}枚</p>
                    <p className="text-xs text-gray-500">
                      {matchPhotos.length > 0
                        ? "あなたが写っている写真が見つかりました"
                        : "一致する写真が見つかりませんでした"}
                    </p>
                  </div>
                </div>

                {/* Background search progress */}
                {searchingMore && searchProgress && (
                  <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                    <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <span className="flex-1">検索中... {searchProgress.done}/{searchProgress.total}枚処理済み</span>
                    <button
                      onClick={() => { stopSearchRef.current = true; }}
                      className="text-blue-500 hover:text-blue-700 font-medium underline whitespace-nowrap"
                    >
                      検索を停止
                    </button>
                  </div>
                )}

                {/* Search mode / threshold filter */}
                {isVisionMode ? (
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <span className="text-xs font-medium text-gray-600">検索モード</span>
                    <select
                      value={searchMode}
                      onChange={(e) => setSearchMode(e.target.value as SearchMode)}
                      className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6EC6FF]"
                      aria-label="検索モード"
                    >
                      <option value="recommended">🎯 おすすめ（高一致＋中一致）</option>
                      <option value="strict">🔍 厳密（高一致のみ）</option>
                      <option value="broad">📸 幅広く（低確信も含む）</option>
                    </select>
                    <div className="flex gap-2 text-xs">
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">高一致</span>
                      <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">中一致</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600">一致度の閾値（リアルタイム）</span>
                      <span className="text-xs font-bold text-gray-800">{Math.round(threshold * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.4}
                      max={0.9}
                      step={0.05}
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      className="w-full accent-[#6EC6FF]"
                      aria-label="一致度の閾値"
                    />
                    <div className="flex gap-2 text-xs">
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">70%以上: 高一致</span>
                      <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">60〜70%: 中一致</span>
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">〜60%: 低一致</span>
                    </div>
                  </div>
                )}

                {/* Photo grid with score badges */}
                {filteredResults.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                    {filteredResults.map((r) => {
                      const photo = allPhotos.find((p) => p.id === r.photoId);
                      const photoUrl = photo?.thumbnailUrl || photo?.url || photo?.originalUrl;
                      const level = getMatchLevel(r.similarity);
                      return (
                        <div key={r.faceId} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                          {photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photoUrl}
                              alt="マッチ写真"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                              No image
                            </div>
                          )}
                          {/* Score badge top-left */}
                          <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-xs font-bold ${level.bg} ${level.color} shadow`}>
                            {r.matchPercent}%<br />
                            <span className="text-xs leading-none">{level.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {matchPhotos.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-4">
                    {isVisionMode ? "「幅広く」モードに変更すると結果が増えることがあります" : "閾値を下げると結果が増えます"}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setStep("select"); setPreviewUrl(null); setAllSearchResults([]); }}
                    className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    やり直す
                  </button>
                  <button
                    onClick={handleApplyResults}
                    disabled={matchPhotos.length === 0}
                    className="flex-1 py-2 rounded-xl bg-[#6EC6FF] text-white text-sm font-medium hover:bg-[#5ab5ee] transition-colors disabled:opacity-50"
                  >
                    {matchPhotos.length > 0 ? `${matchPhotos.length}枚を表示` : "一致なし"}
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {step === "error" && (
              <div className="text-center py-6 space-y-4">
                <p className="text-3xl">😔</p>
                <p className="text-sm text-gray-500">{statusText}</p>
                <button
                  onClick={() => { setStep("select"); setPreviewUrl(null); }}
                  className="px-6 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  やり直す
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Photo Preview Modal with navigation */}
      <AnimatePresence>
        {showPhotoPreview && currentPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
            onClick={() => setShowPhotoPreview(false)}
          >
            <button
              onClick={() => setShowPhotoPreview(false)}
              className="absolute top-4 right-4 text-white hover:text-white text-4xl leading-none z-10"
              aria-label="閉じる"
            >
              ×
            </button>

            <div className="absolute top-4 left-4 bg-white/20 text-white text-sm px-4 py-2 rounded-full font-bold">
              {currentPhotoIndex + 1} / {matchPhotos.length}
            </div>

            {/* Score badge for current photo */}
            {(() => {
              const r = filteredResults.find(r => r.photoId === currentPhotoId);
              if (!r) return null;
              const level = getMatchLevel(r.similarity);
              return (
                <div className={`absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-sm font-bold ${level.bg} ${level.color} shadow-lg z-10`}>
                  {r.matchPercent}% {level.label}
                </div>
              );
            })()}

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-6xl h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute inset-0 flex" onClick={(e) => e.stopPropagation()}>
                <div className="w-1/2 h-full cursor-pointer" onClick={goToPrevPhoto} aria-label="前の写真" />
                <div className="w-1/2 h-full cursor-pointer" onClick={goToNextPhoto} aria-label="次の写真" />
              </div>

              <WatermarkedPhoto
                src={currentPhoto?.originalUrl || currentPhoto?.url || currentPhoto?.thumbnailUrl || ""}
                wmConfig={wmConfig}
                faceBbox={currentFaceBbox || undefined}
                className="w-full h-full object-contain"
              />

              <button
                onClick={(e) => { e.stopPropagation(); goToPrevPhoto(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 p-3 rounded-full shadow-xl transition-all z-10"
                aria-label="前の写真"
              >
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); goToNextPhoto(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 p-3 rounded-full shadow-xl transition-all z-10"
                aria-label="次の写真"
              >
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}

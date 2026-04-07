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

const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_THRESHOLD = 0.55;
// rollback marker: preserve non-broken browser queryEmbedding path until isolated PoC is ready

let faceApiLoaded = false;

async function loadFaceApi() {
  const faceapi = await import("@vladmandic/face-api");
  if (!faceApiLoaded) {
    try {
      await import("@tensorflow/tfjs-backend-cpu");
      const tfAny = faceapi.tf as unknown as { setBackend?: (name: string) => Promise<unknown>; ready?: () => Promise<unknown> };
      if (tfAny.setBackend) await tfAny.setBackend("cpu");
      if (tfAny.ready) await tfAny.ready();
    } catch (err) {
      console.warn("[FaceSearch] Failed to force tfjs cpu backend:", err);
    }
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
      // Draw blue rectangle on the matched face
      if (faceBbox) {
        const bx = Number(faceBbox.x) || 0;
        const by = Number(faceBbox.y) || 0;
        const bw = Number(faceBbox.width) || 0;
        const bh = Number(faceBbox.height) || 0;
        if (bw > 0 && bh > 0) {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = Math.max(3, Math.min(img.width, img.height) / 150);
          ctx.strokeRect(bx, by, bw, bh);
        }
      }
    };
    img.src = src;
  }, [src, wmConfig, faceBbox]);
  return <canvas ref={canvasRef} className={className} />;
}

/** Thumbnail with blue face bbox overlay for result grid */
function ResultThumbnail({ src, bbox }: { src: string; bbox?: { x: number; y: number; width: number; height: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Draw square crop (aspect-ratio 1:1)
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      const displaySize = 300;
      canvas.width = displaySize;
      canvas.height = displaySize;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, displaySize, displaySize);

      // Draw blue rectangle on the matched face
      if (bbox) {
        const scale = displaySize / size;
        const bx = (Number(bbox.x) - sx) * scale;
        const by = (Number(bbox.y) - sy) * scale;
        const bw = Number(bbox.width) * scale;
        const bh = Number(bbox.height) * scale;
        if (bw > 0 && bh > 0) {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.strokeRect(bx, by, bw, bh);
        }
      }
    };
    img.src = src;
  }, [src, bbox]);
  return <canvas ref={canvasRef} className="w-full h-full object-cover" />;
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
  const [previewUrls, setPreviewUrls] = useState<string[]>([]); // multi-image support (up to 3)
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [detectedFaceUrl, setDetectedFaceUrl] = useState<string | null>(null);
  const [currentFaceBbox, setCurrentFaceBbox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [allSearchResults, setAllSearchResults] = useState<FaceSearchResult[]>([]);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [maxResults, setMaxResults] = useState(DEFAULT_MAX_RESULTS);
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

  // Filter, sort, deduplicate by photoId (one result per photo), limit to maxResults
  const filteredResults = useMemo(() => {
    const seen = new Set<string>();
    return allSearchResults
      .filter((r) => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .filter((r) => {
        if (seen.has(r.photoId)) return false;
        seen.add(r.photoId);
        return true;
      })
      .slice(0, maxResults);
  }, [allSearchResults, threshold, maxResults]);

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
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files).slice(0, 3); // max 3 images

    const readFile = (file: File): Promise<string> =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

    Promise.all(fileArray.map(readFile)).then((dataUrls) => {
      setPreviewUrl(dataUrls[0]); // first image as main preview
      setPreviewUrls(dataUrls);
      if (dataUrls.length === 1) {
        processImage(dataUrls[0]);
      } else {
        processImages(dataUrls);
      }
    });
  };

  const processImages = async (imageDataUrls: string[]) => {
    setStep("loading");
    setStatusText("AI顔認証で検索中... (" + imageDataUrls.length + "枚)");
    setSearchingMore(false);
    setSearchProgress(null);
    stopSearchRef.current = false;
    setAllSearchResults([]); // clear previous results

    const csrfToken = getCsrfToken();
    try {
      setStatusText(`FaceNet AIで${imageDataUrls.length}枚を解析中...`);
      const res = await fetch("/api/face/search-insightface", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({
          eventId,
          imagesBase64: imageDataUrls,
          threshold: 0.3,
          limit: 200,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log('[FaceSearch] API response:', JSON.stringify(data));
        if (data.error && data.matchCount === 0 && data.error.includes("No face detected")) {
          setStep("error");
          setStatusText("顔が検出されませんでした。別の写真をお試しください。");
          return;
        }
        if (data.error && data.matchCount === 0 && data.error.includes("API unavailable")) {
          await processImageWithFaceApi(imageDataUrls[0]);
          return;
        }
        if (data.error && data.matchCount === 0 && data.error.includes("No FaceNet embeddings")) {
          setStep("error");
          setStatusText("DBにFaceNetインデックスがありません。管理画面から「FaceNet再構築」を実行してください。");
          return;
        }
        if (data.error && data.matchCount === 0) {
          setStep("error");
          setStatusText(data.error);
          return;
        }
        const results = ((data.results || []) as FaceSearchResult[])
          .map((r) => ({ ...r, matchPercent: Math.round(r.similarity * 100) }))
          .sort((a, b) => b.similarity - a.similarity);
        setIsVisionMode(true);
        setAllSearchResults(results);
        setStep("results");
        setStatusText(results.length > 0 ? `${results.length}件ヒット` : "一致写真は見つかりませんでした");
        return;
      }
      await processImageWithFaceApi(imageDataUrls[0]);
    } catch (e) {
      console.error("[FaceSearch] multi-image search error:", e);
      await processImageWithFaceApi(imageDataUrls[0]);
    }
  };

  const processImage = async (imageDataUrl: string) => {
    setStep("loading");
    setStatusText("AI顔認証で検索中...");
    setSearchingMore(false);
    setSearchProgress(null);
    stopSearchRef.current = false;
    setAllSearchResults([]); // clear previous results

    const csrfToken = getCsrfToken();
    try {
      setStatusText("FaceNet AIで顔を解析中...");
      const res = await fetch("/api/face/search-insightface", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({
          eventId,
          imageBase64: imageDataUrl,
          threshold: 0.3,
          limit: 200,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log('[FaceSearch] API response:', JSON.stringify(data));
        if (data.error && data.matchCount === 0 && data.error.includes("No face detected")) {
          setStep("error");
          setStatusText("顔が検出されませんでした。顔がはっきり写った写真をお試しください。");
          return;
        }
        if (data.error && data.matchCount === 0 && data.error.includes("API unavailable")) {
          console.warn("[FaceSearch] FaceNet unavailable, falling back to face-api.js");
          await processImageWithFaceApi(imageDataUrl);
          return;
        }
        if (data.error && data.matchCount === 0 && data.error.includes("No FaceNet embeddings")) {
          setStep("error");
          setStatusText("DBにFaceNetインデックスがありません。管理画面から「FaceNet再構築」を実行してください。");
          return;
        }
        if (data.error && data.matchCount === 0) {
          setStep("error");
          setStatusText(data.error);
          return;
        }
        const results = ((data.results || []) as FaceSearchResult[])
          .map((r) => ({ ...r, matchPercent: Math.round(r.similarity * 100) }))
          .sort((a, b) => b.similarity - a.similarity);
        setIsVisionMode(true);
        setAllSearchResults(results);
        setStep("results");
        setStatusText(results.length > 0 ? `${results.length}件ヒット` : "一致写真は見つかりませんでした");
        return;
      }

      // HTTP error → fallback to face-api.js
      console.warn("[FaceSearch] FaceNet search failed, falling back to face-api.js");
      await processImageWithFaceApi(imageDataUrl);
    } catch (err) {
      console.error("[FaceSearch] FaceNet search error:", err);
      // Fallback to face-api.js
      await processImageWithFaceApi(imageDataUrl);
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
          threshold: 0.55,
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
                    <span className="text-xs text-gray-400">最大3枚・精度UP</span>
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
                  multiple
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
                {previewUrls.length > 1 ? (
                  <div className="flex justify-center gap-2">
                    {previewUrls.map((url, i) => (
                      <div key={i} className="w-16 h-16 rounded-full overflow-hidden border-4 border-[#6EC6FF]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`検索顔${i + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : previewUrl && (
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

                {/* Threshold slider + Top N */}
                <div className="bg-gray-50 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">類似度しきい値</span>
                    <span className="text-xs font-bold text-gray-800">{Math.round(threshold * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={0.9}
                    step={0.05}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full accent-[#6EC6FF]"
                    aria-label="類似度しきい値"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2 text-xs">
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">70%↑ 高一致</span>
                      <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">60〜70% 中</span>
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">〜60% 低</span>
                    </div>
                    <select
                      value={maxResults}
                      onChange={(e) => setMaxResults(Number(e.target.value))}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#6EC6FF]"
                      aria-label="表示件数"
                    >
                      <option value={10}>Top 10</option>
                      <option value={20}>Top 20</option>
                      <option value={50}>Top 50</option>
                      <option value={100}>Top 100</option>
                    </select>
                  </div>
                </div>

                {/* Photo grid with face bbox + score */}
                {filteredResults.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                    {filteredResults.map((r) => {
                      const photo = allPhotos.find((p) => p.id === r.photoId);
                      const photoUrl = photo?.thumbnailUrl || photo?.url || photo?.originalUrl;
                      const level = getMatchLevel(r.similarity);
                      return (
                        <div key={r.faceId} className="relative rounded-lg overflow-hidden bg-gray-100 cursor-pointer group" onClick={() => { const idx = matchPhotos.indexOf(r.photoId); if (idx >= 0) { setCurrentPhotoIndex(idx); setCurrentFaceBbox(r.bbox || null); setShowPhotoPreview(true); onResults(matchPhotos); } }}>
                          <div className="aspect-square relative">
                            {photoUrl ? (
                              <ResultThumbnail src={photoUrl} bbox={r.bbox} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                                No image
                              </div>
                            )}
                          </div>
                          {/* Score badge top-left */}
                          <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-xs font-bold ${level.bg} ${level.color} shadow`}>
                            {r.matchPercent}%
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

            {/* Top bar: filename + counter */}
            <div className="absolute top-4 left-4 bg-black/60 text-white text-sm px-4 py-2 rounded-lg font-medium z-10">
              {(() => {
                const photo = allPhotos.find((p) => p.id === currentPhotoId);
                const url = photo?.originalUrl || photo?.url || photo?.thumbnailUrl || "";
                const filename = url.split("/").pop() || `photo_${currentPhotoId}`;
                return filename;
              })()}
            </div>

            <div className="absolute top-4 right-14 bg-white/20 text-white text-sm px-3 py-2 rounded-full font-bold z-10">
              {currentPhotoIndex + 1} / {matchPhotos.length}
            </div>

            {/* Bottom detail bar: similarity, face index, filename */}
            {(() => {
              const r = filteredResults.find(r => r.photoId === currentPhotoId);
              if (!r) return null;
              const photo = allPhotos.find((p) => p.id === r.photoId);
              const url = photo?.originalUrl || photo?.url || photo?.thumbnailUrl || "";
              const filename = url.split("/").pop() || `photo_${r.photoId}`;
              const faceIndex = r.faceId?.split("_").pop() || "0";
              return (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-sm px-6 py-3 rounded-xl z-10 flex items-center gap-6">
                  <span>類似度: <strong>{r.matchPercent}%</strong></span>
                  <span>顔番号: <strong>#{faceIndex}</strong></span>
                  <span>ファイル: <strong>{filename}</strong></span>
                </div>
              );
            })()}

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-6xl h-[80vh]"
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

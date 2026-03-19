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

let faceApiLoaded = false;

async function loadFaceApi() {
  const faceapi = await import("face-api.js");
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
      // Draw face highlight if bbox provided
      if (faceBbox) {
        const padding = 0.2;
        const x = faceBbox.x - faceBbox.width * padding;
        const y = faceBbox.y - faceBbox.height * padding;
        const w = faceBbox.width * (1 + padding * 2);
        const h = faceBbox.height * (1 + padding * 2);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = Math.max(3, Math.min(img.width, img.height) / 100);
        ctx.setLineDash([10, 5]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        // Add corner markers
        const cornerSize = Math.max(10, Math.min(img.width, img.height) / 50);
        ctx.strokeStyle = "#60a5fa";
        ctx.lineWidth = Math.max(5, Math.min(img.width, img.height) / 50);
        // Top-left
        ctx.beginPath();
        ctx.moveTo(x, y + cornerSize);
        ctx.lineTo(x, y);
        ctx.lineTo(x + cornerSize, y);
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.moveTo(x + w - cornerSize, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + cornerSize);
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(x, y + h - cornerSize);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + cornerSize, y + h);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(x + w - cornerSize, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w, y + h - cornerSize);
        ctx.stroke();
      }
    };
    img.src = src;
  }, [src, wmConfig, faceBbox]);
  return <canvas ref={canvasRef} className={className} />;
}

export default function FaceSearchModal({ open, onClose, eventId, onResults, allPhotos = [] }: Props) {
  const [step, setStep] = useState<Step>("select");
  const [statusText, setStatusText] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [matchPhotos, setMatchPhotos] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [detectedFaceUrl, setDetectedFaceUrl] = useState<string | null>(null);
  const [currentFaceBbox, setCurrentFaceBbox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);

  // Watermark config
  const wmConfig = useMemo(() => {
    if (typeof window === "undefined") return DEFAULT_WATERMARK_CONFIG;
    const tenantId = sessionStorage.getItem("adminTenantId") || sessionStorage.getItem("tenantId") || "default";
    return getWatermarkConfig(tenantId);
  }, []);
  const streamRef = useRef<MediaStream | null>(null);

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
      setMatchCount(0);
      setMatchPhotos([]);
      setDetectedFaceUrl(null);
      setCurrentFaceBbox(null);
      setShowPhotoPreview(false);
      setCurrentPhotoIndex(0);
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
    setStatusText("モデル読込中...");

    // Step 1: Load face-api.js models
    let faceapi: Awaited<ReturnType<typeof loadFaceApi>> | null = null;
    try {
      faceapi = await loadFaceApi();
    } catch (err) {
      console.error("[FaceSearch] Model load failed:", err);
      // Fallback: use Gemini Vision to confirm face presence
      setStatusText("AIモデルの読み込みに失敗しました。代替APIで確認中...");
      await fallbackGeminiDetect(imageDataUrl);
      return;
    }

    // Step 2: Load image element
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

    // Step 3: Detect faces
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

    // Step 4: Search API
    const queryEmbedding = Array.from(detections[0].descriptor);
    try {
      const csrfToken = getCsrfToken();
      const res = await fetch("/api/face/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({
          eventId,
          queryEmbedding,
          threshold: 0.5,
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

      const photoIds = Array.from(new Set(results.map((r) => r.photoId)));
      const resultsWithPercent = results.map((r) => ({
        ...r,
        matchPercent: Math.round(r.similarity * 100),
      }));

      setMatchCount(photoIds.length);
      setMatchPhotos(photoIds);
      // Extract face thumbnail from first result
      if (resultsWithPercent.length > 0 && resultsWithPercent[0].bbox) {
        const firstPhoto = allPhotos.find(p => p.id === resultsWithPercent[0].photoId);
        if (firstPhoto?.originalUrl && resultsWithPercent[0].bbox) {
          extractFaceThumbnail(firstPhoto.originalUrl, resultsWithPercent[0].bbox)
            .then(setDetectedFaceUrl)
            .catch(() => setDetectedFaceUrl(null));
        setCurrentFaceBbox(resultsWithPercent[0].bbox || null);
        }
      }
      (window as unknown as { __faceSearchResults?: FaceSearchResult[] }).__faceSearchResults = resultsWithPercent;
      setStep("results");
    } catch (err) {
      console.error("[FaceSearch] Search API failed:", err);
      setStep("error");
      setStatusText("検索 API への接続に失敗しました。ネットワーク環境をご確認ください。");
    }
  };

  /**
   * Gemini Vision fallback: confirm face presence when face-api.js models fail to load.
   * Cannot produce embeddings, so full similarity search is unavailable.
   */
  const fallbackGeminiDetect = async (imageDataUrl: string) => {
    try {
      const csrfToken = getCsrfToken();
      const res = await fetch("/api/face/detect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ action: "detect", imageUrl: imageDataUrl }),
      });

      if (!res.ok) {
        setStep("error");
        setStatusText(`AIモデルの読み込みに失敗しました（代替 API エラー: ${res.status}）。ネットワーク環境をご確認の上、再試行してください。`);
        return;
      }

      const data = await res.json();
      const faceCount: number = data.faceCount ?? 0;

      if (faceCount === 0) {
        setStep("error");
        setStatusText("顔が検出されませんでした。別の写真をお試しください。");
      } else {
        setStep("error");
        setStatusText(
          `顔は検出されましたが、AIモデルが利用できないため詳細な検索ができません。` +
          `ネットワーク環境を確認の上、再試行してください。`
        );
      }
    } catch (err) {
      console.error("[FaceSearch] Gemini fallback failed:", err);
      setStep("error");
      setStatusText("AIモデルの読み込みに失敗しました。ネットワーク環境をご確認の上、再試行してください。");
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
  }, [matchPhotos.length]);

  const goToNextPhoto = useCallback(() => {
    goToPhoto((currentPhotoIndex + 1) % matchPhotos.length);
  }, [currentPhotoIndex, matchPhotos.length, goToPhoto]);

  const goToPrevPhoto = useCallback(() => {
    goToPhoto((currentPhotoIndex - 1 + matchPhotos.length) % matchPhotos.length);
  }, [currentPhotoIndex, matchPhotos.length, goToPhoto]);

  // Keyboard navigation for photo preview
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
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
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
                  自撮り写真またはファイルから顔を検出し、<br />あなたが写っている写真を自動で見つけます
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
              </div>
            )}

            {/* Results */}
            {step === "results" && (
              <div className="text-center py-4 space-y-4">
                {previewUrl && (
                  <div className="w-20 h-20 mx-auto rounded-full overflow-hidden border-4 border-green-400">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="検索顔" className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <p className="text-2xl font-bold text-gray-800">{matchCount}枚</p>
                  <p className="text-sm text-gray-500">あなたが写っている写真が見つかりました</p>
                </div>
                
                {/* Match confidence badges */}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {/* Detected face thumbnail */}
                {detectedFaceUrl && (
                  <div className="mb-4 text-center">
                    <p className="text-sm text-gray-600 mb-2">検出された顔</p>
                    <img src={detectedFaceUrl} alt="検出顔" className="w-32 h-32 object-cover rounded-full border-4 border-blue-400 shadow-lg mx-auto" />
                  </div>
                )}
                
                {/* Match percent badges */}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(window as any).__faceSearchResults?.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {((window as any).__faceSearchResults as FaceSearchResult[])
                      .slice(0, 10)
                      .map((r: FaceSearchResult) => (
                        <span
                          key={r.faceId}
                          className={`text-xs font-bold px-3 py-1 rounded-full ${
                            (r.matchPercent || 0) >= 80
                              ? "bg-green-100 text-green-700"
                              : (r.matchPercent || 0) >= 60
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {r.matchPercent || 0}%{
                            (r.matchPercent || 0) >= 80 ? "（高）" :
                            (r.matchPercent || 0) >= 60 ? "（中）" : "（低）"
                          }
                        </span>
                      ))}
                  </div>
                )}
                
                <div className="flex gap-2">
                  <button
                    onClick={() => { setStep("select"); setPreviewUrl(null); }}
                    className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    やり直す
                  </button>
                  <button
                    onClick={handleApplyResults}
                    disabled={matchCount === 0}
                    className="flex-1 py-2 rounded-xl bg-[#6EC6FF] text-white text-sm font-medium hover:bg-[#5ab5ee] transition-colors disabled:opacity-50"
                  >
                    {matchCount > 0 ? `${matchCount}枚を表示` : "一致なし"}
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
            {/* Close button */}
            <button
              onClick={() => setShowPhotoPreview(false)}
              className="absolute top-4 right-4 text-white hover:text-white text-4xl leading-none z-10"
              aria-label="閉じる"
            >
              ×
            </button>

            {/* Photo counter */}
            <div className="absolute top-4 left-4 bg-white/20 text-white text-sm px-4 py-2 rounded-full font-bold">
              {currentPhotoIndex + 1} / {matchPhotos.length}
            </div>

            {/* Photo content */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-6xl h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Click zones for navigation */}
              <div className="absolute inset-0 flex" onClick={(e) => e.stopPropagation()}>
                <div className="w-1/2 h-full cursor-pointer" onClick={goToPrevPhoto} aria-label="前の写真" />
                <div className="w-1/2 h-full cursor-pointer" onClick={goToNextPhoto} aria-label="次の写真" />
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <WatermarkedPhoto
                src={currentPhoto?.originalUrl || currentPhoto?.url || currentPhoto?.thumbnailUrl || ""}
                wmConfig={wmConfig}
                faceBbox={currentFaceBbox || undefined}
                className="w-full h-full object-contain"
              />

              {/* Previous button - visible on screen */}
              <button
                onClick={(e) => { e.stopPropagation(); goToPrevPhoto(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 p-3 rounded-full shadow-xl transition-all z-10"
                aria-label="前の写真"
              >
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Next button - visible on screen */}
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

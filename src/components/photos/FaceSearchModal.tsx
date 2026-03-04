"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getCsrfToken } from "@/lib/csrf";

interface FaceSearchResult {
  photoId: string;
  faceId: string;
  similarity: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  eventId: string;
  onResults: (photoIds: string[]) => void;
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

export default function FaceSearchModal({ open, onClose, eventId, onResults }: Props) {
  const [step, setStep] = useState<Step>("select");
  const [statusText, setStatusText] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [matchPhotos, setMatchPhotos] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
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
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
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

    try {
      const faceapi = await loadFaceApi();
      setStatusText("顔検出中...");

      const img = await loadImage(imageDataUrl);
      const detections = await faceapi
        .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (detections.length === 0) {
        setStep("error");
        setStatusText("顔が検出されませんでした。別の写真をお試しください。");
        return;
      }

      setStatusText(`${detections.length}件の顔を検出。検索中...`);

      // Use first face for search
      const queryEmbedding = Array.from(detections[0].descriptor);

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
        throw new Error(`Search failed: ${res.status}`);
      }

      const data = await res.json();
      const results = (data.results || []) as FaceSearchResult[];
      const photoIds = Array.from(new Set(results.map((r) => r.photoId)));

      setMatchCount(photoIds.length);
      setMatchPhotos(photoIds);
      setStep("results");
    } catch (err) {
      console.error("[FaceSearch] Error:", err);
      setStep("error");
      setStatusText("顔検索に失敗しました。もう一度お試しください。");
    }
  };

  const handleApplyResults = () => {
    onResults(matchPhotos);
    onClose();
  };

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
    </AnimatePresence>
  );
}

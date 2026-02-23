"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import RainbowButton from "@/components/ui/RainbowButton";

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newPreviews: string[] = [];
    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        newPreviews.push(URL.createObjectURL(file));
      }
    });
    setPreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleSubmit = () => {
    if (previews.length === 0) return;
    sessionStorage.setItem("uploadCount", String(previews.length));
    router.push("/processing");
  };

  const removePhoto = (index: number) => {
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <main className="min-h-screen flex flex-col items-center p-6 pt-12">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-3xl font-extrabold text-purple-600 mb-2">
          写真をアップロード
        </h1>
        <p className="text-gray-500">イベントの写真を選んでね</p>
      </motion.div>

      {/* Drop zone */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          w-full max-w-lg border-4 border-dashed rounded-3xl p-8 text-center cursor-pointer
          transition-colors
          ${isDragging ? "border-purple-500 bg-purple-50" : "border-purple-200 bg-white/60"}
        `}
        data-testid="drop-zone"
      >
        <div className="text-6xl mb-4">📸</div>
        <p className="text-lg font-bold text-gray-600">
          タップして写真を選ぶ
        </p>
        <p className="text-sm text-gray-400 mt-1">
          またはここにドラッグ＆ドロップ
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
          data-testid="file-input"
        />
      </motion.div>

      {/* Previews */}
      <AnimatePresence>
        {previews.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-lg mt-6"
          >
            <p className="text-sm font-bold text-gray-600 mb-3" data-testid="photo-count">
              選んだ写真: {previews.length}枚
            </p>
            <div className="grid grid-cols-3 gap-3">
              {previews.map((url, i) => (
                <motion.div
                  key={url}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  className="relative aspect-square rounded-xl overflow-hidden shadow-md"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`写真 ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removePhoto(i);
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full text-xs font-bold shadow"
                    data-testid={`remove-photo-${i}`}
                  >
                    ✕
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-8"
      >
        <RainbowButton
          onClick={handleSubmit}
          disabled={previews.length === 0}
          size="lg"
        >
          アップロードする →
        </RainbowButton>
      </motion.div>
    </main>
  );
}

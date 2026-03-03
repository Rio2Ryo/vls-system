"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { PhotoData } from "@/lib/types";
import { useRef, useEffect, useCallback } from "react";

interface PhotoModalProps {
  photo: PhotoData | null;
  onClose: () => void;
}

function LargeWatermarkedImage({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Render at 30% resolution for low-quality preview
      const w = Math.floor(img.width * 0.3);
      const h = Math.floor(img.height * 0.3);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      // Apply blur
      ctx.filter = "blur(1.5px)";
      ctx.drawImage(canvas, 0, 0);
      ctx.filter = "none";

      // Watermark in 2x2 grid
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#000";
      const fontSize = Math.max(w / 18, 14);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.rotate(-Math.PI / 6);

      const stepX = w / 2;
      const stepY = h / 2;
      for (let row = -1; row <= 2; row++) {
        for (let col = -1; col <= 2; col++) {
          ctx.fillText("© みらい発見ラボ", col * stepX + stepX / 2, row * stepY + stepY / 2);
        }
      }
      ctx.restore();
    };
    img.src = src;
  }, [src]);

  return <canvas ref={canvasRef} className="max-w-full max-h-[70vh] rounded-2xl" />;
}

export default function PhotoModal({ photo, onClose }: PhotoModalProps) {
  const t = useTranslations("Photos");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (photo) {
      document.addEventListener("keydown", handleKeyDown);
      closeButtonRef.current?.focus();
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [photo, handleKeyDown]);

  return (
    <AnimatePresence>
      {photo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 no-save"
          onClick={onClose}
          onContextMenu={(e) => e.preventDefault()}
          data-testid="photo-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t("modalLabel")}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />

          {/* Content */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <LargeWatermarkedImage src={photo.originalUrl} />

            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label={t("modalClose")}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-md
                         flex items-center justify-center text-gray-500 hover:text-gray-800 text-lg
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
              data-testid="modal-close"
            >
              ×
            </button>

            <div className="text-center mt-4">
              <span className="text-xs text-white/70 bg-black/30 px-3 py-1 rounded-full">
                {t("watermarkPreview")}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

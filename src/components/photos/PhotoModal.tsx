"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PhotoData } from "@/lib/types";
import { useRef, useEffect } from "react";

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
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Watermark
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#000";
      ctx.font = `bold ${Math.max(img.width / 10, 24)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.translate(img.width / 2, img.height / 2);
      ctx.rotate(-Math.PI / 6);
      for (let y = -img.height; y < img.height; y += 120) {
        ctx.fillText("© VLS System", 0, y);
      }
      ctx.restore();
    };
    img.src = src;
  }, [src]);

  return <canvas ref={canvasRef} className="max-w-full max-h-[70vh] rounded-2xl" />;
}

export default function PhotoModal({ photo, onClose }: PhotoModalProps) {
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
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

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
              onClick={onClose}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-md
                         flex items-center justify-center text-gray-500 hover:text-gray-800 text-lg"
              data-testid="modal-close"
            >
              ×
            </button>

            <div className="text-center mt-3">
              <span className="text-xs text-white/70 bg-black/30 px-3 py-1 rounded-full">
                透かし入りプレビュー
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

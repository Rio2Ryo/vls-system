"use client";

import { motion } from "framer-motion";
import { PhotoData } from "@/lib/types";
import { useRef, useEffect } from "react";

interface PhotoGridProps {
  photos: PhotoData[];
  selectedIds: string[];
  onToggleSelect: (photo: PhotoData) => void;
  onPreview: (photo: PhotoData) => void;
}

function WatermarkedImage({ src, alt }: { src: string; alt: string }) {
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

      // Draw image
      ctx.drawImage(img, 0, 0);

      // Apply slight blur for "low quality" effect
      ctx.filter = "blur(0.5px)";
      ctx.drawImage(canvas, 0, 0);
      ctx.filter = "none";

      // Draw watermark text
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "#000";
      ctx.font = `bold ${Math.max(img.width / 12, 20)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Diagonal watermark pattern
      ctx.translate(img.width / 2, img.height / 2);
      ctx.rotate(-Math.PI / 6);
      for (let y = -img.height; y < img.height; y += 100) {
        ctx.fillText("© VLS System", 0, y);
      }
      ctx.restore();
    };
    img.src = src;
  }, [src]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full object-cover"
      aria-label={alt}
    />
  );
}

export default function PhotoGrid({ photos, selectedIds, onToggleSelect, onPreview }: PhotoGridProps) {
  return (
    <div
      className="grid grid-cols-3 md:grid-cols-4 gap-3 no-save"
      data-testid="photo-grid"
      onContextMenu={(e) => e.preventDefault()}
    >
      {photos.map((photo, i) => {
        const isSelected = selectedIds.includes(photo.id);
        return (
          <motion.div
            key={photo.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            onClick={() => onToggleSelect(photo)}
            className={`relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 cursor-pointer
                       shadow-sm hover:shadow-md transition-all border-2 ${
                         isSelected ? "border-[#6EC6FF] ring-2 ring-blue-200" : "border-gray-100"
                       }`}
            data-testid={`photo-${photo.id}`}
          >
            <WatermarkedImage src={photo.thumbnailUrl} alt={`写真 ${i + 1}`} />

            {/* Selection checkmark */}
            <div
              className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                isSelected
                  ? "bg-[#6EC6FF] text-white shadow-md"
                  : "bg-white/70 text-gray-400 border border-gray-300"
              }`}
              data-testid={`check-${photo.id}`}
            >
              {isSelected ? "✓" : ""}
            </div>

            {/* Preview button */}
            <button
              onClick={(e) => { e.stopPropagation(); onPreview(photo); }}
              className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/40 text-white
                         flex items-center justify-center text-xs hover:bg-black/60 transition-colors"
              data-testid={`preview-${photo.id}`}
            >
              🔍
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}

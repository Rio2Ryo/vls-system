"use client";

import { motion } from "framer-motion";
import { PhotoData } from "@/lib/types";
import { useRef, useEffect } from "react";

interface PhotoGridProps {
  photos: PhotoData[];
  onPhotoClick: (photo: PhotoData) => void;
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

export default function PhotoGrid({ photos, onPhotoClick }: PhotoGridProps) {
  return (
    <div
      className="grid grid-cols-3 md:grid-cols-4 gap-3 no-save"
      data-testid="photo-grid"
      onContextMenu={(e) => e.preventDefault()}
    >
      {photos.map((photo, i) => (
        <motion.div
          key={photo.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
          onClick={() => onPhotoClick(photo)}
          className="aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 cursor-pointer
                     shadow-sm hover:shadow-md transition-shadow border border-gray-100"
          data-testid={`photo-${photo.id}`}
        >
          <WatermarkedImage src={photo.thumbnailUrl} alt={`写真 ${i + 1}`} />
        </motion.div>
      ))}
    </div>
  );
}

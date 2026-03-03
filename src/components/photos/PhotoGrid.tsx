"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { DEFAULT_WATERMARK_CONFIG, PhotoData, WatermarkConfig } from "@/lib/types";
import { useRef, useEffect, useMemo } from "react";
import { getWatermarkConfig } from "@/lib/store";

interface PhotoGridProps {
  photos: PhotoData[];
  selectedIds: string[];
  onToggleSelect: (photo: PhotoData) => void;
  onPreview: (photo: PhotoData) => void;
}

/**
 * Draw watermark on a canvas using the provided WatermarkConfig.
 * Shared by PhotoGrid (preview) and can be reused elsewhere.
 */
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

function WatermarkedImage({ src, alt, wmConfig }: { src: string; alt: string; wmConfig: Omit<WatermarkConfig, "tenantId"> }) {
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

      // Draw image at reduced resolution
      ctx.drawImage(img, 0, 0, w, h);

      // Apply blur for low-quality effect (if enabled in config)
      if (wmConfig.blur) {
        ctx.filter = "blur(1.5px)";
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = "none";
      }

      // Draw watermark using config
      drawWatermark(ctx, w, h, wmConfig);
    };
    img.src = src;
  }, [src, wmConfig]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full object-cover"
      aria-label={alt}
    />
  );
}

export default function PhotoGrid({ photos, selectedIds, onToggleSelect, onPreview }: PhotoGridProps) {
  const t = useTranslations("Photos");

  // Load watermark config for the current tenant (from sessionStorage tenantId)
  const wmConfig = useMemo(() => {
    if (typeof window === "undefined") return DEFAULT_WATERMARK_CONFIG;
    const tenantId = sessionStorage.getItem("adminTenantId") || sessionStorage.getItem("tenantId") || "default";
    return getWatermarkConfig(tenantId);
  }, []);

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
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`${t("photoN", { n: i + 1 })}${isSelected ? t("photoSelected") : ""}`}
            tabIndex={0}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            onClick={() => onToggleSelect(photo)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleSelect(photo); } }}
            className={`relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 cursor-pointer
                       shadow-sm hover:shadow-md transition-all border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] focus-visible:ring-offset-2 ${
                         isSelected ? "border-[#6EC6FF] ring-2 ring-blue-200" : "border-gray-100"
                       }`}
            data-testid={`photo-${photo.id}`}
          >
            <WatermarkedImage src={photo.thumbnailUrl} alt={t("photoN", { n: i + 1 })} wmConfig={wmConfig} />

            {/* Quality badge */}
            {photo.qualityScore !== undefined && photo.qualityScore >= 80 && (
              <span className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-400 text-yellow-900 font-bold shadow-sm z-10">
                おすすめ
              </span>
            )}

            {/* Button bar */}
            <div className="absolute bottom-0 left-0 right-0 flex">
              <span
                className={`flex-1 py-2 text-xs font-bold text-center transition-colors ${
                  isSelected
                    ? "bg-[#6EC6FF] text-white"
                    : "bg-white/80 text-gray-700"
                }`}
                aria-hidden="true"
                data-testid={`check-${photo.id}`}
              >
                {isSelected ? t("selected") : t("select")}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onPreview(photo); }}
                aria-label={t("previewAria", { n: i + 1 })}
                className="flex-1 py-2 text-xs font-bold text-center bg-black/50 text-white
                           hover:bg-black/60 transition-colors
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
                data-testid={`preview-${photo.id}`}
              >
                {t("preview")}
              </button>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

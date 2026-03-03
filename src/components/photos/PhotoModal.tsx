"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { DEFAULT_WATERMARK_CONFIG, PhotoData, WatermarkConfig } from "@/lib/types";
import { useRef, useEffect, useCallback, useMemo } from "react";
import { getWatermarkConfig } from "@/lib/store";

interface PhotoModalProps {
  photo: PhotoData | null;
  onClose: () => void;
}

/**
 * Draw watermark on a canvas using the provided WatermarkConfig.
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

function LargeWatermarkedImage({ src, wmConfig }: { src: string; wmConfig: Omit<WatermarkConfig, "tenantId"> }) {
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

      // Apply blur if enabled
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

  return <canvas ref={canvasRef} className="max-w-full max-h-[70vh] rounded-2xl" />;
}

export default function PhotoModal({ photo, onClose }: PhotoModalProps) {
  const t = useTranslations("Photos");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Load watermark config for the current tenant
  const wmConfig = useMemo(() => {
    if (typeof window === "undefined") return DEFAULT_WATERMARK_CONFIG;
    const tenantId = sessionStorage.getItem("adminTenantId") || sessionStorage.getItem("tenantId") || "default";
    return getWatermarkConfig(tenantId);
  }, []);

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
            <LargeWatermarkedImage src={photo.originalUrl} wmConfig={wmConfig} />

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

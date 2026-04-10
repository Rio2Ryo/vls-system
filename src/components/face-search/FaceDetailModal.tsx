"use client";

import { useEffect, useCallback } from "react";
import { type FaceResult, getAnnotatedImageUrl } from "@/lib/face-api-client";

interface FaceModalProps {
  result: FaceResult;
  onClose: () => void;
}

export default function FaceDetailModal({ result, onClose }: FaceModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h3>📸 {result.image_name}</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getAnnotatedImageUrl(result.image_name, result.face_index)}
            alt={`Annotated ${result.image_name}`}
          />
          <div className="modal-info">
            <span>
              類似度: <strong>{(result.similarity * 100).toFixed(1)}%</strong>
            </span>
            <span>
              検出スコア: <strong>{(result.det_score * 100).toFixed(1)}%</strong>
            </span>
            <span>
              Face: <strong>#{result.face_index}</strong>
            </span>
            <span>
              BBox: <strong>[{result.bbox.map((v) => Math.round(v)).join(", ")}]</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

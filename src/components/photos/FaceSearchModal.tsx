"use client";

/**
 * FaceSearchModal — 顔テスト②の page.tsx をモーダル化したもの
 * 検索ロジックは顔テスト②と100%同一: /api/proxy/search → HF Space /search
 * face-api.js, TensorFlow.js, D1, Claude Vision は一切使わない
 */

import { useState, useCallback } from "react";
import {
  searchFaces,
  type SearchResponse,
  type FaceResult,
} from "@/lib/face-api-client";
import ResultsGrid from "@/components/face-search/ResultsGrid";
import FaceDetailModal from "@/components/face-search/FaceDetailModal";
import "@/app/face-search.css";

interface Props {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventName?: string;
  onResults?: (photoIds: string[]) => void;
  allPhotos?: { id: string; originalUrl?: string; thumbnailUrl?: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function FaceSearchModal({ open, onClose, eventId: _eventId, onResults, allPhotos = [] }: Props) {
  // Upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  // Search state (same as 顔テスト②)
  const [threshold, setThreshold] = useState(0.55);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);

  // Detail modal state (same as 顔テスト②)
  const [modalResult, setModalResult] = useState<FaceResult | null>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);

  // Error state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Handle file selection (same as 顔テスト②)
  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const newFiles = Array.from(files).slice(0, 3 - selectedFiles.length);
      const updated = [...selectedFiles, ...newFiles].slice(0, 3);
      setSelectedFiles(updated);

      const newPreviews: string[] = [];
      updated.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          newPreviews.push(e.target?.result as string);
          if (newPreviews.length === updated.length) {
            setPreviews([...newPreviews]);
          }
        };
        reader.readAsDataURL(file);
      });

      if (updated.length === 0) {
        setPreviews([]);
      }
    },
    [selectedFiles]
  );

  const removeFile = useCallback(
    (index: number) => {
      const updated = selectedFiles.filter((_, i) => i !== index);
      setSelectedFiles(updated);
      setPreviews((prev) => prev.filter((_, i) => i !== index));
    },
    [selectedFiles]
  );

  // Search (same as 顔テスト②)
  const handleSearch = async () => {
    if (selectedFiles.length === 0) {
      setErrorMsg("画像をアップロードしてください");
      return;
    }

    setSearching(true);
    setSearchResult(null);
    setErrorMsg(null);

    try {
      const result = await searchFaces(selectedFiles, threshold);
      setSearchResult(result);

      // Map image_name → VLS photoId for gallery filtering
      if (onResults && allPhotos.length > 0) {
        const suffixToPhotoId = new Map<string, string>();
        for (const p of allPhotos) {
          const url = p.originalUrl || p.thumbnailUrl || "";
          const fn = url.split("/").pop() || "";
          const hi = fn.lastIndexOf("-");
          const suffix = hi >= 0 ? fn.slice(hi + 1) : fn;
          if (suffix) suffixToPhotoId.set(suffix, p.id);
        }

        const matchedPhotoIds: string[] = [];
        for (const r of result.results) {
          const hi = r.image_name.lastIndexOf("-");
          const suffix = hi >= 0 ? r.image_name.slice(hi + 1) : r.image_name;
          const photoId = suffixToPhotoId.get(suffix);
          if (photoId && !matchedPhotoIds.includes(photoId)) {
            matchedPhotoIds.push(photoId);
          }
        }
        onResults(matchedPhotoIds);
      }

      const noFace = result.query_faces.filter((f) => f.status === "no_face");
      if (noFace.length > 0) {
        setErrorMsg(`${noFace.length}枚の画像で顔が検出されませんでした`);
      }
    } catch (err) {
      setErrorMsg(`${err}`);
    } finally {
      setSearching(false);
    }
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setPreviews([]);
    setSearchResult(null);
    setErrorMsg(null);
  };

  // Drag & Drop (same as 顔テスト②)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  if (!open) return null;

  return (
    <div className="face-finder-scope">
      {/* Overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 9998,
        }}
        onClick={onClose}
      />
      {/* Modal panel */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
        }}
      >
        <div
          style={{
            background: "var(--bg-secondary, #0d0d1a)",
            borderRadius: "20px",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
            maxWidth: "1200px",
            width: "100%",
            maxHeight: "90vh",
            overflow: "auto",
            padding: "28px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, background: "var(--gradient-main, linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              🔍 顔で検索
            </h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          {/* Upload Card (same as 顔テスト②) */}
          <div className="card">
            <div className="card-title">
              <span className="icon">📷</span>
              検索したい人物の画像（最大3枚）
            </div>

            {selectedFiles.length < 3 && (
              <div
                className={`upload-zone ${isDragging ? "dragover" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById("faceFinderFileInput")?.click()}
              >
                <div className="upload-icon">📁</div>
                <div className="upload-text">画像をドラッグ＆ドロップ</div>
                <div className="upload-hint">またはクリックして選択（JPG / PNG）</div>
                <input
                  type="file"
                  id="faceFinderFileInput"
                  multiple
                  accept="image/*"
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
                  onChange={(e) => {
                    if (e.target.files) handleFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            )}

            {/* Preview grid (same as 顔テスト②) */}
            <div className="preview-grid">
              {[0, 1, 2].map((i) => (
                <div className="preview-item" key={i}>
                  {previews[i] ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previews[i]} alt={`Preview ${i + 1}`} />
                      <button className="remove-btn" onClick={() => removeFile(i)}>✕</button>
                      {searchResult?.query_faces[i] && (
                        <span className={`status-icon ${searchResult.query_faces[i].status === "ok" ? "ok" : "error-label"}`}>
                          {searchResult.query_faces[i].status === "ok" ? "✓ 顔検出" : "✗ 未検出"}
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="preview-placeholder">
                      <span className="num">{i + 1}</span>未選択
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Search controls (same as 顔テスト②) */}
            <div className="search-controls">
              <div className="threshold-control">
                <label>類似度閾値</label>
                <input
                  type="range"
                  min="0.3"
                  max="0.9"
                  step="0.01"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                />
                <span className="threshold-value">{threshold.toFixed(2)}</span>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleSearch}
                disabled={selectedFiles.length === 0 || searching}
              >
                {searching ? (
                  <><span className="spinner" /> 検索中...</>
                ) : (
                  <>🔍 顔検索</>
                )}
              </button>
              {searchResult && (
                <button className="btn btn-secondary" onClick={handleReset}>
                  やり直す
                </button>
              )}
            </div>
          </div>

          {/* Error message */}
          {errorMsg && (
            <div style={{ padding: "12px 16px", borderRadius: "12px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", fontSize: "14px", marginBottom: "16px" }}>
              {errorMsg}
            </div>
          )}

          {/* Loading (same as 顔テスト②) */}
          {searching && (
            <div className="card">
              <div className="searching-overlay">
                <div className="spinner spinner-large" />
                <div className="searching-text">FaceNet で顔を検索しています...</div>
              </div>
            </div>
          )}

          {/* Results (same as 顔テスト②) */}
          {searchResult && !searching && (
            <div className="card results-section">
              <div className="results-header">
                <div>
                  <div className="card-title" style={{ marginBottom: "4px" }}>
                    <span className="icon">🎯</span>
                    検索結果
                  </div>
                  <div className="results-count">
                    <strong>{searchResult.total_results}</strong>件 表示 /
                    <strong> {searchResult.total_matched}</strong>件 マッチ
                    {searchResult.duplicates_removed > 0 && (
                      <span> ({searchResult.duplicates_removed}件 重複除去)</span>
                    )}
                  </div>
                </div>
                <div className="results-meta">
                  <span>Embeddings: {searchResult.embeddings_used}枚</span>
                  <span>閾値: {searchResult.threshold}</span>
                </div>
              </div>

              {searchResult.results.length > 0 ? (
                <ResultsGrid
                  results={searchResult.results}
                  onCardClick={(result) => setModalResult(result)}
                />
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">😕</div>
                  <p>条件に合う顔が見つかりませんでした</p>
                  <p style={{ fontSize: "13px", marginTop: "8px", color: "var(--text-muted)" }}>
                    閾値を下げて再検索してみてください
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal (same as 顔テスト②) */}
      {modalResult && (
        <FaceDetailModal
          result={modalResult}
          onClose={() => setModalResult(null)}
        />
      )}
    </div>
  );
}

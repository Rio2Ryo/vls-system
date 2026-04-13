"use client";

/**
 * FaceSearchModal — 顔テスト②の page.tsx をモーダル化したもの
 * 検索ロジックは顔テスト②と100%同一: /api/proxy/search → HF Space /search
 * face-api.js, TensorFlow.js, D1, Claude Vision は一切使わない
 */

import { useState, useCallback, useRef } from "react";
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

export default function FaceSearchModal({
  open,
  onClose,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  eventId: _eventId,
  onResults,
  allPhotos = [],
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  // Search state (same as 顔テスト②)
  const [threshold, setThreshold] = useState(0.70);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);

  // Detail modal state (same as 顔テスト②)
  const [modalResult, setModalResult] = useState<FaceResult | null>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);

  // Error state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Display limit (default: top 20)
  const [displayLimit, setDisplayLimit] = useState<number>(20);

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
      const updated = selectedFiles.filter((_: File, i: number) => i !== index);
      setSelectedFiles(updated);
      setPreviews((prev: string[]) => prev.filter((_: string, i: number) => i !== index));
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
      // Both VLS URLs and HF image_names contain the original filename after a timestamp prefix
      // VLS: "1773571007297-gym_001.jpg" → "gym_001.jpg"
      // HF:  "imgi_33_1773751174225-gym_001.jpg" → "gym_001.jpg"
      if (onResults && allPhotos.length > 0) {
        // Extract original filename: strip timestamp prefix (10+ digits followed by -)
        const extractOriginal = (name: string): string => {
          const match = name.match(/\d{10,}-(.+)$/);
          if (match) return match[1].toLowerCase();
          // fallback: return as-is
          return name.toLowerCase();
        };

        // Build lookup: original filename → photoId
        const origToPhotoId = new Map<string, string>();
        for (const p of allPhotos) {
          const url = p.originalUrl || p.thumbnailUrl || "";
          const fn = url.split("/").pop() || "";
          if (fn) {
            origToPhotoId.set(extractOriginal(fn), p.id);
          }
        }

        // Match FaceNet results to VLS photos
        const matchedIds = new Set<string>();
        const unmapped: string[] = [];
        for (const r of result.results) {
          const orig = extractOriginal(r.image_name);
          const photoId = origToPhotoId.get(orig);
          if (photoId) {
            matchedIds.add(photoId);
          } else {
            unmapped.push(r.image_name);
          }
        }

        console.log(`[FaceSearch] ${result.results.length} results → ${matchedIds.size} mapped, ${unmapped.length} unmapped`);
        if (unmapped.length > 0) {
          console.log(`[FaceSearch] unmapped examples:`, unmapped.slice(0, 5));
        }
        onResults(Array.from(matchedIds));
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
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            border: "1px solid #e0e0e0",
            maxWidth: "1200px",
            width: "100%",
            maxHeight: "90vh",
            overflow: "auto",
            padding: "28px",
            pointerEvents: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
          className="face-finder-scope"
        >
          {/* Close button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a2e" }}>
              🔍 顔で検索
            </h2>
            <button
              style={{ width: 32, height: 32, borderRadius: "50%", background: "#f0f0f0", border: "1px solid #ddd", color: "#333", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}
              onClick={onClose}
            >✕</button>
          </div>

          {/* Hidden file input — triggered by ref */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {/* Upload Card (same as 顔テスト②) */}
          <div className="card">
            <div className="card-title">
              <span className="icon">📷</span>
              検索したい人物の画像（最大3枚）
            </div>
            <p style={{ fontSize: "12px", color: "#888", margin: "4px 0 12px", lineHeight: 1.5 }}>
              💡 異なる角度の画像を複数枚アップすると検索精度が上がります
            </p>

            {selectedFiles.length < 3 && (
              <div
                className={`upload-zone ${isDragging ? "dragover" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ cursor: "pointer" }}
              >
                <div className="upload-icon">📁</div>
                <div className="upload-text">画像をドラッグ＆ドロップ</div>
                <div className="upload-hint">またはクリックして選択（JPG / PNG）</div>
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
                <label>スコア閾値</label>
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
                    <strong>{Math.min(displayLimit || searchResult.total_results, searchResult.total_results)}</strong>件 表示 /
                    <strong> {searchResult.total_matched}</strong>件 マッチ
                    {searchResult.duplicates_removed > 0 && (
                      <span> ({searchResult.duplicates_removed}件 重複除去)</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <select
                    value={displayLimit || 0}
                    onChange={(e) => setDisplayLimit(Number(e.target.value))}
                    style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "13px", background: "#fff", color: "#333", cursor: "pointer" }}
                  >
                    <option value={20}>Top 20</option>
                    <option value={50}>50件表示</option>
                    <option value={100}>100件表示</option>
                    <option value={0}>全件表示</option>
                  </select>
                <div className="results-meta">
                    <span>Embeddings: {searchResult.embeddings_used}枚</span>
                    <span>閾値: {searchResult.threshold}</span>
                    {searchResult.searchMode && (
                      <span className={`search-mode-badge ${searchResult.searchMode === 'embedding' ? 'mode-embedding' : 'mode-vision'}`}>
                        {searchResult.searchMode === 'embedding' ? '🧮 FaceNet Embedding' : '👁️ Claude Vision'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {searchResult.results.length > 0 ? (
                <ResultsGrid
                  results={displayLimit ? searchResult.results.slice(0, displayLimit) : searchResult.results}
                  onCardClick={(result) => setModalResult(result)}
                  searchMode={searchResult.searchMode}
                />
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">😕</div>
                  <p>条件に合う顔が見つかりませんでした</p>
                  <p style={{ fontSize: "13px", marginTop: "8px", color: "#5a6178" }}>
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

"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { searchFaces, getAllImageNames, getImageUrl } from "@/lib/face-api-client";
import type { SearchResponse } from "@/lib/face-api-client";
import "@/app/face-search.css";

export default function PhotosPage() {
  // --- Image list from HF Space ---
  const [allImages, setAllImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // --- Search state ---
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [threshold, setThreshold] = useState(0.70);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [matchedImageNames, setMatchedImageNames] = useState<Set<string> | null>(null);

  // --- UI state ---
  const [eventName, setEventName] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load event name from session
  useEffect(() => {
    setEventName(sessionStorage.getItem("eventName") || "イベント");
  }, []);

  // Load all image names from HF Space
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const names = await getAllImageNames();
        if (!cancelled) {
          setAllImages(names);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(`画像一覧の取得に失敗しました: ${err}`);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Displayed images: filtered if search active, otherwise all
  const displayedImages = useMemo(() => {
    if (!matchedImageNames) return allImages;
    return allImages.filter((name) => matchedImageNames.has(name));
  }, [allImages, matchedImageNames]);

  // File selection handler
  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 3 - selectedFiles.length);
    const newFiles = [...selectedFiles, ...arr].slice(0, 3);
    setSelectedFiles(newFiles);
    // Generate previews
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return newPreviews;
    });
    setErrorMsg("");
  }, [selectedFiles]);

  // Search handler
  const handleSearch = async () => {
    if (selectedFiles.length === 0) return;
    setSearching(true);
    setErrorMsg("");
    setSearchResult(null);

    try {
      const result = await searchFaces(selectedFiles, threshold);
      setSearchResult(result);

      // Extract matched image names directly from FaceNet results
      const matched = new Set<string>();
      for (const r of result.results) {
        matched.add(r.image_name);
      }
      setMatchedImageNames(matched.size > 0 ? matched : null);

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

  // Reset handler
  const handleReset = () => {
    setSelectedFiles([]);
    setPreviews((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return [];
    });
    setSearchResult(null);
    setMatchedImageNames(null);
    setErrorMsg("");
  };

  // Remove single preview
  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  return (
    <main style={{ minHeight: "100vh", background: "#fafbfc", padding: "24px 16px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: "center", marginBottom: 24 }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a2e" }}>
            {eventName} の写真
          </h1>
          <p style={{ color: "#888", fontSize: 14, marginTop: 4 }}>
            {matchedImageNames
              ? `🔍 ${displayedImages.length}枚一致 / ${allImages.length}枚の写真`
              : loading
                ? "読み込み中..."
                : `${allImages.length}枚の写真が見つかりました`}
          </p>
        </motion.div>

        {/* Inline face search UI */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
            border: "1px solid #eee",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", marginBottom: 4 }}>
            📷 検索したい人物の画像（最大3枚）
          </div>
          <p style={{ fontSize: 12, color: "#888", margin: "4px 0 12px", lineHeight: 1.5 }}>
            💡 複数枚アップすると検索精度が上がります
          </p>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {/* Drop zone + preview slots */}
          {selectedFiles.length < 3 && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
              }}
              style={{
                border: "2px dashed #c8d8e8",
                borderRadius: 12,
                padding: "24px 16px",
                textAlign: "center",
                cursor: "pointer",
                background: "#f8faff",
                marginBottom: 12,
                transition: "border-color 0.2s",
              }}
            >
              <div style={{ fontSize: 14, color: "#666" }}>画像をドラッグ＆ドロップ</div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>またはクリックして選択（JPG / PNG）</div>
            </div>
          )}

          {/* Preview thumbnails */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 10,
                  border: previews[i] ? "2px solid #6EC6FF" : "2px dashed #ddd",
                  background: previews[i] ? "#000" : "#f9f9f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {previews[i] ? (
                  <>
                    <img
                      src={previews[i]}
                      alt={`Query ${i + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >✕</button>
                  </>
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, color: "#ccc" }}>{i + 1}</div>
                    <div style={{ fontSize: 10, color: "#bbb" }}>未選択</div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Threshold slider */}
          <div className="face-finder-scope" style={{ marginBottom: 12 }}>
            <div className="threshold-control">
              <label style={{ fontSize: 13, color: "#555", fontWeight: 500 }}>
                スコア閾値: {threshold.toFixed(2)}
              </label>
              <input
                type="range"
                min="0.40"
                max="0.95"
                step="0.01"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                style={{ width: "100%", marginTop: 4 }}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSearch}
              disabled={selectedFiles.length === 0 || searching}
              style={{
                flex: 1,
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                background: selectedFiles.length > 0 && !searching
                  ? "linear-gradient(135deg, #7C3AED, #EC4899)"
                  : "#ddd",
                color: selectedFiles.length > 0 && !searching ? "#fff" : "#999",
                fontWeight: 600,
                fontSize: 14,
                cursor: selectedFiles.length > 0 && !searching ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              {searching ? "🔍 検索中..." : "🔍 顔検索"}
            </button>
            {(selectedFiles.length > 0 || searchResult) && (
              <button
                onClick={handleReset}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  color: "#666",
                  fontWeight: 500,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                やり直す
              </button>
            )}
          </div>

          {/* Error message */}
          {errorMsg && (
            <div style={{ color: "#e53e3e", fontSize: 13, marginTop: 8 }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Search results summary */}
          {searchResult && (
            <div style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "#f0fdf4",
              borderRadius: 10,
              fontSize: 13,
              color: "#166534",
              border: "1px solid #bbf7d0",
            }}>
              ✅ {searchResult.total_matched}件マッチ
              {searchResult.duplicates_removed > 0 && (
                <span style={{ color: "#888", marginLeft: 8 }}>
                  (重複除去: {searchResult.duplicates_removed}件)
                </span>
              )}
            </div>
          )}
        </motion.div>

        {/* Clear filter badge */}
        {matchedImageNames && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#7C3AED",
              background: "#f3e8ff",
              padding: "4px 12px",
              borderRadius: 20,
            }}>
              🔍 {displayedImages.length}枚一致
            </span>
            <button
              onClick={() => {
                setMatchedImageNames(null);
                setSearchResult(null);
              }}
              style={{
                fontSize: 12,
                color: "#888",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              全て表示
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            <div>画像を読み込んでいます...</div>
          </div>
        )}

        {/* Error state */}
        {loadError && (
          <div style={{ textAlign: "center", padding: 40, color: "#e53e3e" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>❌</div>
            <div>{loadError}</div>
          </div>
        )}

        {/* Image grid - all from HF Space */}
        {!loading && !loadError && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}>
            {displayedImages.map((imageName) => (
              <motion.div
                key={imageName}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                style={{
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#eee",
                  position: "relative",
                  cursor: "pointer",
                  aspectRatio: "4/3",
                }}
                onClick={() => setPreviewImage(imageName)}
              >
                <img
                  src={getImageUrl(imageName)}
                  alt={imageName}
                  loading="lazy"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                {/* Show similarity score if search is active */}
                {matchedImageNames && searchResult && (() => {
                  const match = searchResult.results.find((r) => r.image_name === imageName);
                  if (!match) return null;
                  return (
                    <div style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      background: "rgba(0,0,0,0.7)",
                      color: "#4ade80",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 6,
                    }}>
                      {(match.similarity * 100).toFixed(0)}%
                    </div>
                  );
                })()}
              </motion.div>
            ))}
          </div>
        )}

        {/* Empty state after search */}
        {!loading && !loadError && displayedImages.length === 0 && matchedImageNames && (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>😢</div>
            <div>一致する写真が見つかりませんでした</div>
          </div>
        )}

        {/* Full-size preview modal */}
        <AnimatePresence>
          {previewImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewImage(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.85)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                cursor: "pointer",
              }}
            >
              <motion.img
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                src={getImageUrl(previewImage)}
                alt={previewImage}
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "90vw",
                  maxHeight: "90vh",
                  objectFit: "contain",
                  borderRadius: 8,
                  cursor: "default",
                }}
              />
              <button
                onClick={() => setPreviewImage(null)}
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.2)",
                  color: "#fff",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >✕</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

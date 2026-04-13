"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { searchFaces, getAllImageNames, getImageUrl } from "@/lib/face-api-client";
import type { SearchResponse } from "@/lib/face-api-client";
import "@/app/face-search.css";

export default function PhotosPage() {
  const router = useRouter();

  // --- Image list from HF Space ---
  const [allImages, setAllImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // --- Selection state ---
  const [checkedImages, setCheckedImages] = useState<Set<string>>(new Set());

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
  // When search is active, sort by highest similarity score
  const displayedImages = useMemo(() => {
    if (!matchedImageNames || !searchResult) return allImages;
    const filtered = allImages.filter((name) => matchedImageNames.has(name));
    // Sort by best similarity score descending
    filtered.sort((a, b) => {
      const scoreA = Math.max(...searchResult.results.filter(r => r.image_name === a).map(r => r.similarity), 0);
      const scoreB = Math.max(...searchResult.results.filter(r => r.image_name === b).map(r => r.similarity), 0);
      return scoreB - scoreA;
    });
    return filtered;
  }, [allImages, matchedImageNames, searchResult]);

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

      console.log('[FaceSearch] HF response:', {
        total_results: result.total_results,
        total_matched: result.total_matched,
        duplicates_removed: result.duplicates_removed,
        unique_images: matched.size,
        image_names: Array.from(matched).slice(0, 5),
      });

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
                  flex: 1,
                  aspectRatio: "1",
                  borderRadius: 10,
                  border: previews[i] ? "2px solid #6EC6FF" : "2px dashed #ddd",
                  background: previews[i] ? "#000" : "#f9f9f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  overflow: "hidden",
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

          {/* Action buttons - PC: 横並び, SP: 縦並び */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button
              onClick={handleSearch}
              disabled={selectedFiles.length === 0 || searching}
              style={{
                flex: "1 1 200px",
                padding: "12px 16px",
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
            <button
              onClick={() => {
                if (checkedImages.size === 0) return;
                sessionStorage.setItem("selectedPhotoIds", JSON.stringify(Array.from(checkedImages)));
                router.push("/downloading");
              }}
              disabled={checkedImages.size === 0}
              style={{
                flex: "1 1 200px",
                padding: "12px 16px",
                borderRadius: 10,
                border: "none",
                background: checkedImages.size > 0
                  ? "linear-gradient(135deg, #3B82F6, #06B6D4)"
                  : "#e5e7eb",
                color: checkedImages.size > 0 ? "#fff" : "#999",
                fontWeight: 600,
                fontSize: 14,
                cursor: checkedImages.size > 0 ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              📥 チェックした画像をダウンロード{checkedImages.size > 0 ? `（${checkedImages.size}枚）` : ""}
            </button>
          </div>
          {(selectedFiles.length > 0 || searchResult) && (
            <div style={{ textAlign: "right", marginTop: 6 }}>
              <button
                onClick={handleReset}
                style={{
                  background: "none",
                  border: "none",
                  color: "#888",
                  fontSize: 13,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                やり直す
              </button>
            </div>
          )}

          {/* Error message */}
          {errorMsg && (
            <div style={{ color: "#e53e3e", fontSize: 13, marginTop: 8 }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Search results summary */}
          {searchResult && matchedImageNames && (
            <div style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "#f0fdf4",
              borderRadius: 10,
              fontSize: 13,
              color: "#166534",
              border: "1px solid #bbf7d0",
            }}>
              ✅ {matchedImageNames.size}枚の写真に一致
              <span style={{ color: "#888", marginLeft: 8 }}>
                （{searchResult.total_matched}箇所の顔を検出）
              </span>
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
              🔍 {matchedImageNames.size}枚一致
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
            {displayedImages.map((imageName) => {
              const isChecked = checkedImages.has(imageName);
              return (
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
                    outline: isChecked ? "3px solid #3B82F6" : "none",
                    outlineOffset: -3,
                  }}
                >
                  <img
                    src={getImageUrl(imageName)}
                    alt={imageName}
                    loading="lazy"
                    onClick={() => setPreviewImage(imageName)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  {/* Checkbox */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setCheckedImages((prev) => {
                        const next = new Set(prev);
                        if (next.has(imageName)) {
                          next.delete(imageName);
                        } else {
                          next.add(imageName);
                        }
                        return next;
                      });
                    }}
                    style={{
                      position: "absolute",
                      top: 6,
                      left: 6,
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      border: isChecked ? "none" : "2px solid rgba(255,255,255,0.8)",
                      background: isChecked ? "#3B82F6" : "rgba(0,0,0,0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                    }}
                  >
                    {isChecked && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7L5.5 10.5L12 3.5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
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
                        スコア {Math.round(match.similarity * 100)}
                      </div>
                    );
                  })()}
                </motion.div>
              );
            })}
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import PhotoGrid from "@/components/photos/PhotoGrid";
import PhotoModal from "@/components/photos/PhotoModal";
import FaceSearchModal from "@/components/photos/FaceSearchModal";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { getStoredEvents, updateAnalyticsRecord, getFaceGroups } from "@/lib/store";
import { PhotoData, FaceGroup } from "@/lib/types";
import { trackPageView, trackPageLeave, trackScroll, trackTap } from "@/lib/tracker";

export default function PhotosPage() {
  const router = useRouter();
  const t = useTranslations("Photos");
  const [previewPhoto, setPreviewPhoto] = useState<PhotoData | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<"default" | "recommended">("default");
  const [faceFilter, setFaceFilter] = useState<string>("all");
  const [faceGroups, setFaceGroupsState] = useState<FaceGroup[]>([]);
  const [eventName, setEventName] = useState("");
  const [faceSearchOpen, setFaceSearchOpen] = useState(false);
  const [faceSearchPhotoIds, setFaceSearchPhotoIds] = useState<string[] | null>(null);
  const [eventId, setEventId] = useState("");

  // Behavior tracking — page view and leave
  useEffect(() => {
    trackPageView("/photos");
    const enterTime = Date.now();
    return () => trackPageLeave("/photos", enterTime);
  }, []);

  // Behavior tracking — scroll depth
  useEffect(() => {
    const tracked = new Set<number>();
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = Math.round((scrollTop / docHeight) * 100);
      for (const threshold of [25, 50, 75, 100]) {
        if (pct >= threshold && !tracked.has(threshold)) {
          tracked.add(threshold);
          trackScroll("/photos", threshold);
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!sessionStorage.getItem("eventId")) router.replace("/");
  }, [router]);

  const photos = useMemo(() => {
    if (typeof window === "undefined") return [];
    const eventId = sessionStorage.getItem("eventId");
    const events = getStoredEvents();
    const event = events.find((e) => e.id === eventId);
    return event?.photos || [];
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const eid = sessionStorage.getItem("eventId");
    if (eid) {
      setEventId(eid);
      setFaceGroupsState(getFaceGroups(eid));
    }
  }, []);

  const filteredByFace = useMemo(() => {
    // Face search results take priority
    if (faceSearchPhotoIds) {
      return photos.filter((p) => faceSearchPhotoIds.includes(p.id));
    }
    if (faceFilter === "all") return photos;
    const group = faceGroups.find((g) => g.id === faceFilter);
    if (!group) return photos;
    return photos.filter((p) => group.photoIds.includes(p.id));
  }, [photos, faceFilter, faceGroups, faceSearchPhotoIds]);

  const sortedPhotos = useMemo(() => {
    if (sortMode === "recommended") {
      return [...filteredByFace].sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));
    }
    return filteredByFace;
  }, [filteredByFace, sortMode]);

  useEffect(() => {
    setEventName(sessionStorage.getItem("eventName") || "イベント");
    // Record photos viewed
    const analyticsId = sessionStorage.getItem("analyticsId");
    if (analyticsId) {
      updateAnalyticsRecord(analyticsId, {
        stepsCompleted: {
          access: true,
          survey: true,
          cmViewed: true,
          photosViewed: true,
          downloaded: false,
        },
      });
    }
  }, []);

  const handleToggleSelect = (photo: PhotoData) => {
    trackTap("/photos", "photo-select");
    setSelectedIds((prev) =>
      prev.includes(photo.id)
        ? prev.filter((id) => id !== photo.id)
        : [...prev, photo.id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === photos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(photos.map((p) => p.id));
    }
  };

  const handleDownloadSelected = () => {
    sessionStorage.setItem("selectedPhotoIds", JSON.stringify(selectedIds));
    router.push("/downloading");
  };

  return (
    <main className="min-h-screen p-6 pt-10">
      <div className="max-w-3xl mx-auto">
        {/* Language switcher */}
        <div className="fixed top-4 right-4 z-50">
          <LanguageSwitcher />
        </div>

        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <h1 className="text-2xl font-bold text-gray-800">
            {t("title", { name: eventName })}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {faceSearchPhotoIds
              ? `🔍 ${sortedPhotos.length}枚一致 / ${t("found", { count: photos.length })}`
              : faceFilter !== "all"
                ? `${sortedPhotos.length}枚表示 / ${t("found", { count: photos.length })}`
                : t("found", { count: photos.length })}
          </p>
        </motion.div>

        {/* Face search button + active filter indicator */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setFaceSearchOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all active:scale-95"
            aria-label="顔で検索"
          >
            <span>📸</span>
            <span>顔で検索</span>
          </button>
          {faceSearchPhotoIds && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-purple-600 font-medium bg-purple-50 px-3 py-1 rounded-full">
                {faceSearchPhotoIds.length}枚一致
              </span>
              <button
                onClick={() => setFaceSearchPhotoIds(null)}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                クリア
              </button>
            </div>
          )}
        </div>

        <FaceSearchModal
          open={faceSearchOpen}
          onClose={() => setFaceSearchOpen(false)}
          eventId={eventId}
          onResults={(ids) => {
            setFaceSearchPhotoIds(ids.length > 0 ? ids : null);
            setFaceFilter("all"); // Reset group filter when using face search
          }}
        />

        {/* Face group filter */}
        {faceGroups.length > 0 && !faceSearchPhotoIds && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs text-gray-400">人物:</span>
            <button
              onClick={() => setFaceFilter("all")}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                faceFilter === "all"
                  ? "bg-[#6EC6FF] text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              全員
            </button>
            {faceGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => setFaceFilter(g.id)}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                  faceFilter === g.id
                    ? "bg-[#6EC6FF] text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {g.label} ({g.photoIds.length})
              </button>
            ))}
          </div>
        )}

        {/* Selection toolbar */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={handleSelectAll}
            aria-label={selectedIds.length === photos.length ? t("deselectAllAria") : t("selectAllAria")}
            className="text-sm text-[#6EC6FF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
            data-testid="select-all-btn"
          >
            {selectedIds.length === photos.length ? t("deselectAll") : t("selectAll")}
          </button>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as "default" | "recommended")}
            aria-label="写真の並び順"
            className="text-xs px-2 py-1 rounded-lg border border-gray-200 focus:outline-none focus:border-[#6EC6FF] focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
          >
            <option value="default">登録順</option>
            <option value="recommended">おすすめ順</option>
          </select>
          <AnimatePresence>
            {selectedIds.length > 0 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-sm font-bold text-[#6EC6FF] bg-blue-50 px-3 py-1 rounded-full"
                data-testid="selection-count"
                role="status"
                aria-live="polite"
              >
                {t("selectedCount", { count: selectedIds.length })}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <PhotoGrid
          photos={sortedPhotos}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onPreview={setPreviewPhoto}
        />

        <PhotoModal
          photo={previewPhoto}
          onClose={() => setPreviewPhoto(null)}
        />

        {/* Download selected CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-8 mb-8"
        >
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-3xl p-6 border border-blue-100">
            <p className="text-gray-600 font-medium mb-3">
              {selectedIds.length > 0
                ? t("downloadSelectedDesc", { count: selectedIds.length })
                : t("selectToDownload")}
            </p>
            <Button
              onClick={handleDownloadSelected}
              disabled={selectedIds.length === 0}
              size="lg"
            >
              {t("downloadButton")}
            </Button>
          </div>
        </motion.div>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Button from "@/components/ui/Button";
import PhotoGrid from "@/components/photos/PhotoGrid";
import PhotoModal from "@/components/photos/PhotoModal";
import { getStoredEvents, updateAnalyticsRecord } from "@/lib/store";
import { PhotoData } from "@/lib/types";

export default function PhotosPage() {
  const router = useRouter();
  const [previewPhoto, setPreviewPhoto] = useState<PhotoData | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [eventName, setEventName] = useState("");

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

  const handleDownloadFromPreview = (photo: PhotoData) => {
    sessionStorage.setItem("selectedPhotoIds", JSON.stringify([photo.id]));
    setPreviewPhoto(null);
    router.push("/downloading");
  };

  return (
    <main className="min-h-screen p-6 pt-10">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <h1 className="text-2xl font-bold text-gray-800">
            {eventName} の写真
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {photos.length}枚の写真が見つかりました（プレビュー版）
          </p>
        </motion.div>

        {/* Selection toolbar */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={handleSelectAll}
            className="text-sm text-[#6EC6FF] hover:underline"
            data-testid="select-all-btn"
          >
            {selectedIds.length === photos.length ? "選択解除" : "すべて選択"}
          </button>
          <AnimatePresence>
            {selectedIds.length > 0 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-sm font-bold text-[#6EC6FF] bg-blue-50 px-3 py-1 rounded-full"
                data-testid="selection-count"
              >
                {selectedIds.length}枚選択中
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <PhotoGrid
          photos={photos}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onPreview={setPreviewPhoto}
        />

        <PhotoModal
          photo={previewPhoto}
          onClose={() => setPreviewPhoto(null)}
          onDownload={handleDownloadFromPreview}
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
                ? `${selectedIds.length}枚の写真を高画質でダウンロード`
                : "写真を選択してダウンロード"}
            </p>
            <Button
              onClick={handleDownloadSelected}
              disabled={selectedIds.length === 0}
              size="lg"
            >
              選択した写真をダウンロード →
            </Button>
          </div>
        </motion.div>
      </div>
    </main>
  );
}

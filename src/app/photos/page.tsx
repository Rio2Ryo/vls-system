"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import PhotoGrid from "@/components/photos/PhotoGrid";
import PhotoModal from "@/components/photos/PhotoModal";
import { EVENTS } from "@/lib/data";
import { PhotoData } from "@/lib/types";

export default function PhotosPage() {
  const router = useRouter();
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoData | null>(null);
  const [eventName, setEventName] = useState("");

  const photos = useMemo(() => {
    if (typeof window === "undefined") return [];
    const eventId = sessionStorage.getItem("eventId");
    const event = EVENTS.find((e) => e.id === eventId);
    return event?.photos || [];
  }, []);

  useEffect(() => {
    setEventName(sessionStorage.getItem("eventName") || "イベント");
  }, []);

  const handleDownloadAll = () => {
    sessionStorage.setItem("selectedPhotoIds", JSON.stringify(photos.map((p) => p.id)));
    router.push("/downloading");
  };

  const handleDownloadSingle = (photo: PhotoData) => {
    sessionStorage.setItem("selectedPhotoIds", JSON.stringify([photo.id]));
    setSelectedPhoto(null);
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

        <PhotoGrid photos={photos} onPhotoClick={setSelectedPhoto} />

        <PhotoModal
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
          onDownload={handleDownloadSingle}
        />

        {/* Download CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-8 mb-8"
        >
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-3xl p-6 border border-blue-100">
            <p className="text-gray-600 font-medium mb-3">
              高画質・透かしなしでダウンロードしますか？
            </p>
            <Button onClick={handleDownloadAll} size="lg">
              全写真を高画質でダウンロード →
            </Button>
          </div>
        </motion.div>
      </div>
    </main>
  );
}

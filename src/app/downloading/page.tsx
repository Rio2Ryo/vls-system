"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import ProgressBar from "@/components/ui/ProgressBar";
import LoadingAnimation from "@/components/ui/LoadingAnimation";
import VideoPlayer from "@/components/cm/VideoPlayer";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { Company } from "@/lib/types";

const TOTAL_SECONDS = 60;

function useSelectedPhotoCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const ids: string[] = JSON.parse(sessionStorage.getItem("selectedPhotoIds") || "[]");
    return ids.length;
  } catch {
    return 0;
  }
}

export default function DownloadingPage() {
  const router = useRouter();
  const t = useTranslations("Downloading");
  const [elapsed, setElapsed] = useState(0);
  const [videoDone, setVideoDone] = useState(false);
  const photoCount = useSelectedPhotoCount();

  useEffect(() => {
    if (!sessionStorage.getItem("eventId")) router.replace("/");
  }, [router]);

  const matchedCompany = useMemo((): Company | null => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(sessionStorage.getItem("matchedCompany") || "null");
    } catch {
      return null;
    }
  }, []);

  // Auto-complete video when no matched company to show
  useEffect(() => {
    if (!matchedCompany) {
      setVideoDone(true);
    }
  }, [matchedCompany]);

  // 60-second timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= TOTAL_SECONDS) {
          clearInterval(timer);
          return TOTAL_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const progress = (elapsed / TOTAL_SECONDS) * 100;
  const canProceed = elapsed >= TOTAL_SECONDS && videoDone;

  const handleVideoDone = useCallback(() => {
    setVideoDone(true);
  }, []);

  const handleNext = () => {
    router.push("/complete");
  };

  return (
    <main className="min-h-screen flex flex-col items-center p-6 pt-10">
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
          {t("title")}
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          {photoCount > 0
            ? t("processingPhotos", { count: photoCount })
            : t("almostDone")}
        </p>
      </motion.div>

      <div className="w-full max-w-lg mb-6">
        <ProgressBar progress={progress} label={t("progressLabel")} />
      </div>

      <div className="w-full max-w-lg">
        {matchedCompany ? (
          <Card>
            <VideoPlayer
              videoId={matchedCompany.videos.cm60}
              duration={60}
              label={t("videoLabel", { name: matchedCompany.name })}
              onComplete={handleVideoDone}
              tracking={{
                companyId: matchedCompany.id,
                companyName: matchedCompany.name,
                cmType: "cm60",
                eventId: (typeof window !== "undefined" && sessionStorage.getItem("eventId")) || "",
              }}
            />
          </Card>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center py-8"
          >
            <LoadingAnimation />
          </motion.div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: canProceed ? 1 : 0.3 }}
        className="mt-8"
      >
        <Button onClick={handleNext} disabled={!canProceed} size="lg">
          {t("proceed")}
        </Button>
      </motion.div>

    </main>
  );
}

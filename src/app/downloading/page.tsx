"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ProgressBar from "@/components/ui/ProgressBar";
import LoadingAnimation from "@/components/ui/LoadingAnimation";
import VideoPlayer from "@/components/cm/VideoPlayer";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Company } from "@/lib/types";

function usePlatinumCompanies(): Company[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(sessionStorage.getItem("platinumCompanies") || "[]");
    if (Array.isArray(arr) && arr.length > 0) return arr.slice(0, 3);
    const single = JSON.parse(sessionStorage.getItem("platinumCompany") || "null");
    return single ? [single] : [];
  } catch {
    return [];
  }
}

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
  const [elapsed, setElapsed] = useState(0);
  const [videoDone, setVideoDone] = useState(false);
  const photoCount = useSelectedPhotoCount();
  const platinumCompanies = usePlatinumCompanies();

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
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <h1 className="text-2xl font-bold text-gray-800">
          高画質データを生成中...
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          {photoCount > 0
            ? `${photoCount}枚の写真を処理中...もうすぐ完了します`
            : "もうすぐ完了します"}
        </p>
      </motion.div>

      <div className="w-full max-w-lg mb-6">
        <ProgressBar progress={progress} label="データ生成中" />
      </div>

      <div className="w-full max-w-lg">
        {matchedCompany ? (
          <Card>
            <VideoPlayer
              videoId={matchedCompany.videos.cm60}
              duration={60}
              label={`${matchedCompany.name} からのメッセージ`}
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
          ダウンロードへ →
        </Button>
      </motion.div>

      {/* Platinum sponsor banner — sticky bottom */}
      {platinumCompanies.length > 0 && (
        <div className="sticky bottom-0 z-10 bg-white/90 backdrop-blur border-t border-gray-100 py-2 px-4 w-full">
          <div className="max-w-lg mx-auto flex items-center justify-center gap-4">
            <span className="text-[10px] text-gray-400 flex-shrink-0">提供スポンサー</span>
            {platinumCompanies.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.logoUrl} alt={c.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                <span className="text-xs text-gray-600 font-medium hidden sm:inline">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

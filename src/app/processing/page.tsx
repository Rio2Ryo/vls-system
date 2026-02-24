"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ProgressBar from "@/components/ui/ProgressBar";
import LoadingAnimation from "@/components/ui/LoadingAnimation";
import VideoPlayer from "@/components/cm/VideoPlayer";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { getCMMatch } from "@/lib/matching";
import { updateAnalyticsRecord } from "@/lib/store";
import { InterestTag } from "@/lib/types";

const TOTAL_SECONDS = 45;

export default function ProcessingPage() {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<"platinum" | "matched" | "waiting">("platinum");

  // Load user tags and event companies from session
  const cmMatch = useMemo(() => {
    if (typeof window === "undefined") return getCMMatch([]);
    try {
      const tags: InterestTag[] = JSON.parse(
        sessionStorage.getItem("userTags") || "[]"
      );
      const companyIds: string[] | undefined = (() => {
        try {
          const raw = sessionStorage.getItem("eventCompanyIds");
          return raw ? JSON.parse(raw) : undefined;
        } catch { return undefined; }
      })();
      return getCMMatch(tags, companyIds);
    } catch {
      return getCMMatch([]);
    }
  }, []);

  // Save matched company for STEP 4
  useEffect(() => {
    if (cmMatch.matchedCM) {
      sessionStorage.setItem("matchedCompany", JSON.stringify(cmMatch.matchedCM));
    }
    if (cmMatch.platinumCM) {
      sessionStorage.setItem("platinumCompany", JSON.stringify(cmMatch.platinumCM));
    }
    // Record matched company IDs in analytics
    const analyticsId = sessionStorage.getItem("analyticsId");
    if (analyticsId) {
      updateAnalyticsRecord(analyticsId, {
        matchedCompanyId: cmMatch.matchedCM?.id || undefined,
        platinumCompanyId: cmMatch.platinumCM?.id || undefined,
      });
    }
  }, [cmMatch]);

  // 45-second timer
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
  const canProceed = elapsed >= TOTAL_SECONDS;

  const handlePlatinumDone = useCallback(() => {
    setPhase("matched");
  }, []);

  const handleMatchedDone = useCallback(() => {
    setPhase("waiting");
  }, []);

  const handleNext = () => {
    // Record CM viewed step
    const analyticsId = sessionStorage.getItem("analyticsId");
    if (analyticsId) {
      updateAnalyticsRecord(analyticsId, {
        stepsCompleted: {
          access: true,
          survey: true,
          cmViewed: true,
          photosViewed: false,
          downloaded: false,
        },
      });
    }
    router.push("/photos");
  };

  return (
    <main className="min-h-screen flex flex-col items-center p-6 pt-10">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <h1 className="text-2xl font-bold text-gray-800">
          イベントの全写真データを読み込んでいます...
        </h1>
        <p className="text-gray-400 text-sm mt-1">しばらくお待ちください</p>
      </motion.div>

      <div className="w-full max-w-lg mb-6">
        <ProgressBar progress={progress} label="読み込み中" />
      </div>

      <div className="w-full max-w-lg space-y-4">
        {/* Platinum CM - 15s */}
        {phase === "platinum" && cmMatch.platinumCM && (
          <Card>
            <p className="text-xs text-center text-gray-400 mb-2">
              今日の写真は <span className="font-bold text-[#6EC6FF]">{cmMatch.platinumCM.name}</span> からのプレゼントです！
            </p>
            <VideoPlayer
              videoId={cmMatch.platinumCM.videos.cm15}
              duration={15}
              label="提供CM"
              onComplete={handlePlatinumDone}
            />
          </Card>
        )}

        {/* Matched CM - 30s */}
        {phase === "matched" && cmMatch.matchedCM && (
          <Card>
            <VideoPlayer
              videoId={cmMatch.matchedCM.videos.cm30}
              duration={30}
              label={`${cmMatch.matchedCM.name} のおすすめ`}
              onComplete={handleMatchedDone}
            />
          </Card>
        )}

        {/* Waiting / Loading animation */}
        {(phase === "waiting" || (!cmMatch.platinumCM && !cmMatch.matchedCM)) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center py-8"
          >
            <LoadingAnimation />
          </motion.div>
        )}
      </div>

      {/* Proceed button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: canProceed ? 1 : 0.3 }}
        className="mt-8"
      >
        <Button onClick={handleNext} disabled={!canProceed} size="lg">
          写真を見る →
        </Button>
      </motion.div>
    </main>
  );
}

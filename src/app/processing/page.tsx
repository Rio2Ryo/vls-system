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
import { getCMMatch } from "@/lib/matching";
import { updateAnalyticsRecord } from "@/lib/store";
import { InterestTag } from "@/lib/types";
import { sendNotification } from "@/lib/notify";
import { fireWebhook } from "@/lib/webhook";
import { findActiveABTest, assignVariant, recordABCompletion } from "@/lib/abtest";
import { trackPageView, trackPageLeave } from "@/lib/tracker";

const TOTAL_SECONDS = 45;

export default function ProcessingPage() {
  const router = useRouter();
  const t = useTranslations("Processing");
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<"platinum" | "matched" | "waiting">("platinum");

  // Behavior tracking
  useEffect(() => {
    trackPageView("/processing");
    const enterTime = Date.now();
    return () => trackPageLeave("/processing", enterTime);
  }, []);

  useEffect(() => {
    if (!sessionStorage.getItem("eventId")) router.replace("/");
  }, [router]);

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

  // A/B test variant assignment
  const abTestInfo = useMemo(() => {
    if (typeof window === "undefined" || !cmMatch.matchedCM) return null;
    const eventId = sessionStorage.getItem("eventId") || "";
    const test = findActiveABTest(cmMatch.matchedCM.id, eventId);
    if (!test) return null;
    const userId = sessionStorage.getItem("analyticsId") || `anon-${Date.now()}`;
    const { variant, assignment } = assignVariant(test, userId, eventId);
    // Store assignment ID for later completion tracking
    sessionStorage.setItem("abTestId", test.id);
    sessionStorage.setItem("abAssignmentId", assignment.id);
    return { test, variant, assignment };
  }, [cmMatch.matchedCM]);

  // Determine which CM to show for the matched company
  const matchedVideoId = useMemo(() => {
    if (!cmMatch.matchedCM) return "";
    if (abTestInfo) {
      // Use A/B test assigned variant
      return cmMatch.matchedCM.videos[abTestInfo.variant.cmType];
    }
    // Default: show 30s CM
    return cmMatch.matchedCM.videos.cm30;
  }, [cmMatch.matchedCM, abTestInfo]);

  const matchedDuration = useMemo(() => {
    if (abTestInfo) {
      const durations: Record<string, number> = { cm15: 15, cm30: 30, cm60: 60 };
      return durations[abTestInfo.variant.cmType] || 30;
    }
    return 30;
  }, [abTestInfo]);

  const matchedCmType = useMemo(() => {
    if (abTestInfo) return abTestInfo.variant.cmType;
    return "cm30" as const;
  }, [abTestInfo]);

  // Set correct initial phase based on available CMs
  useEffect(() => {
    if (!cmMatch.platinumCM && cmMatch.matchedCM) {
      setPhase("matched");
    } else if (!cmMatch.platinumCM && !cmMatch.matchedCM) {
      setPhase("waiting");
    }
  }, [cmMatch]);

  // Save matched company for STEP 4
  useEffect(() => {
    if (cmMatch.matchedCM) {
      sessionStorage.setItem("matchedCompany", JSON.stringify(cmMatch.matchedCM));
    }
    if (cmMatch.platinumCM) {
      sessionStorage.setItem("platinumCompany", JSON.stringify(cmMatch.platinumCM));
    }
    if (cmMatch.platinumCMs && cmMatch.platinumCMs.length > 0) {
      sessionStorage.setItem("platinumCompanies", JSON.stringify(cmMatch.platinumCMs));
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
    setPhase(cmMatch.matchedCM ? "matched" : "waiting");
  }, [cmMatch.matchedCM]);

  const handleMatchedDone = useCallback(() => {
    // Record A/B test completion if applicable
    if (abTestInfo) {
      const userId = sessionStorage.getItem("analyticsId") || "";
      if (userId) recordABCompletion(abTestInfo.test.id, userId);
    }
    setPhase("waiting");
  }, [abTestInfo]);

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
    // Send CM completion notification
    const eventId = sessionStorage.getItem("eventId");
    if (eventId && cmMatch?.platinumCM) {
      sendNotification(eventId, "cm_complete", {
        participantName: sessionStorage.getItem("respondentName") || undefined,
        companyName: cmMatch.platinumCM.name,
      });
      fireWebhook("cm_viewed", {
        eventId,
        participantName: sessionStorage.getItem("respondentName") || undefined,
        platinumCompany: cmMatch.platinumCM.name,
        matchedCompany: cmMatch.matchedCM?.name || null,
      });
    }
    router.push("/photos");
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
        <p className="text-gray-400 text-sm mt-1">{t("subtitle")}</p>
      </motion.div>

      <div className="w-full max-w-lg mb-6">
        <ProgressBar progress={progress} label={t("progressLabel")} />
      </div>

      <div className="w-full max-w-lg space-y-4">
        {/* Platinum CM - 15s */}
        {phase === "platinum" && cmMatch.platinumCM && (
          <Card>
            <p className="text-xs text-center text-gray-400 mb-2">
              {t("sponsorPresent", { name: cmMatch.platinumCM.name })}
            </p>
            <VideoPlayer
              videoId={cmMatch.platinumCM.videos.cm15}
              duration={15}
              label={t("cmLabel")}
              onComplete={handlePlatinumDone}
              tracking={{
                companyId: cmMatch.platinumCM.id,
                companyName: cmMatch.platinumCM.name,
                cmType: "cm15",
                eventId: (typeof window !== "undefined" && sessionStorage.getItem("eventId")) || "",
              }}
            />
          </Card>
        )}

        {/* Matched CM — A/B test variant or default 30s */}
        {phase === "matched" && cmMatch.matchedCM && (
          <Card>
            {abTestInfo && (
              <p className="text-[10px] text-center text-purple-400 mb-1">
                A/Bテスト: {abTestInfo.variant.label}
              </p>
            )}
            <VideoPlayer
              videoId={matchedVideoId}
              duration={matchedDuration}
              label={t("recommendLabel", { name: cmMatch.matchedCM.name })}
              onComplete={handleMatchedDone}
              tracking={{
                companyId: cmMatch.matchedCM.id,
                companyName: cmMatch.matchedCM.name,
                cmType: matchedCmType,
                eventId: (typeof window !== "undefined" && sessionStorage.getItem("eventId")) || "",
              }}
            />
          </Card>
        )}

        {/* Waiting / Loading animation — show when no video is active */}
        {(phase === "waiting" || (phase === "platinum" && !cmMatch.platinumCM) || (phase === "matched" && !cmMatch.matchedCM)) && (
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
          {t("viewPhotos")}
        </Button>
      </motion.div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ProgressBar from "@/components/ui/ProgressBar";
import LoadingAnimation from "@/components/ui/LoadingAnimation";
import CMSegmentManager from "@/components/cm/CMSegmentManager";
import SurveyForm from "@/components/survey/SurveyForm";
import { assignSegment, getCMConfig, getTotalWaitTime, SURVEY_QUESTIONS } from "@/lib/segments";
import { SurveyAnswer } from "@/lib/types";

export default function DownloadingPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"loading" | "cm" | "survey" | "done">("loading");
  const [cmDone, setCmDone] = useState(false);

  const segment = useMemo(() => assignSegment(), []);
  const cmConfig = useMemo(() => getCMConfig(segment, "downloading"), [segment]);
  const totalTime = getTotalWaitTime("downloading");

  // Progress timer
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 100 / totalTime;
        if (next >= 100) {
          clearInterval(interval);
          return 100;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [totalTime]);

  // Transition to CM after short loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase("cm");
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleCMComplete = useCallback(() => {
    setCmDone(true);
    setPhase("survey");
  }, []);

  const handleSurveyComplete = useCallback((answers: SurveyAnswer[]) => {
    sessionStorage.setItem("surveyAnswers2", JSON.stringify(answers));
    setPhase("done");
  }, []);

  // Navigate when done
  useEffect(() => {
    if (progress >= 100 && (phase === "done" || cmDone)) {
      const timer = setTimeout(() => {
        router.push("/complete");
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [progress, phase, cmDone, router]);

  return (
    <main className="min-h-screen flex flex-col items-center p-6 pt-12">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <h1 className="text-3xl font-extrabold text-purple-600 mb-2">
          ダウンロードちゅう...
        </h1>
        <p className="text-gray-500">写真をじゅんびしているよ！</p>
      </motion.div>

      <div className="w-full max-w-lg mb-8">
        <ProgressBar progress={progress} label="ダウンロード処理中" />
      </div>

      <div className="w-full max-w-lg">
        {phase === "loading" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center py-8"
          >
            <LoadingAnimation />
          </motion.div>
        )}

        {phase === "cm" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <CMSegmentManager config={cmConfig} onAllComplete={handleCMComplete} />
          </motion.div>
        )}

        {phase === "survey" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-xl font-bold text-center text-purple-500 mb-4">
              もうすこしだけアンケート！
            </h2>
            <SurveyForm
              questions={SURVEY_QUESTIONS}
              onComplete={handleSurveyComplete}
              startIndex={2}
            />
          </motion.div>
        )}

        {phase === "done" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8"
          >
            <div className="text-6xl mb-4">📦</div>
            <p className="text-xl font-bold text-green-500">じゅんびかんりょう！</p>
          </motion.div>
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import TagSelector from "@/components/ui/TagSelector";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { getSurveyForEvent, getStoredSurvey, updateAnalyticsRecord } from "@/lib/store";
import { InterestTag } from "@/lib/types";
import { sendNotification } from "@/lib/notify";
import { fireWebhook } from "@/lib/webhook";
import { trackPageView, trackPageLeave, trackFormSubmit } from "@/lib/tracker";

export default function SurveyPage() {
  const router = useRouter();
  const t = useTranslations("Survey");

  const [currentQ, setCurrentQ] = useState(0);
  const [allAnswers, setAllAnswers] = useState<Record<string, InterestTag[]>>({});
  const [survey] = useState(() => {
    if (typeof window === "undefined") return getStoredSurvey();
    const eventId = sessionStorage.getItem("eventId");
    return eventId ? getSurveyForEvent(eventId) : getStoredSurvey();
  });

  // Behavior tracking
  useEffect(() => {
    trackPageView("/survey");
    const enterTime = Date.now();
    return () => trackPageLeave("/survey", enterTime);
  }, []);

  useEffect(() => {
    if (!sessionStorage.getItem("eventId")) {
      router.replace("/");
      return;
    }
    // If no survey questions, skip directly to processing
    if (survey.length === 0) {
      sessionStorage.setItem("userTags", "[]");
      sessionStorage.setItem("surveyAnswers", "{}");
      const analyticsId = sessionStorage.getItem("analyticsId");
      if (analyticsId) {
        updateAnalyticsRecord(analyticsId, {
          surveyAnswers: {},
          stepsCompleted: { access: true, survey: true, cmViewed: false, photosViewed: false, downloaded: false },
        });
      }
      router.push("/processing");
    }
  }, [router, survey]);

  const question = survey[currentQ];
  const selectedTags = question ? (allAnswers[question.id] || []) : [];

  const handleToggle = (value: string) => {
    const tag = value as InterestTag;
    const current = selectedTags;
    const updated = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    setAllAnswers({ ...allAnswers, [question.id]: updated });
  };

  const handleNext = () => {
    if (currentQ < survey.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      // Collect all selected tags
      const allTags = Object.values(allAnswers).flat();
      sessionStorage.setItem("userTags", JSON.stringify(allTags));
      sessionStorage.setItem("surveyAnswers", JSON.stringify(allAnswers));

      // Record survey completion in analytics
      const analyticsId = sessionStorage.getItem("analyticsId");
      if (analyticsId) {
        updateAnalyticsRecord(analyticsId, {
          surveyAnswers: allAnswers,
          stepsCompleted: {
            access: true,
            survey: true,
            cmViewed: false,
            photosViewed: false,
            downloaded: false,
          },
        });
      }

      // Send registration notification
      const eventId = sessionStorage.getItem("eventId");
      if (eventId) {
        sendNotification(eventId, "registration", {});
        fireWebhook("survey_complete", {
          eventId,
          answers: allAnswers,
        });
      }

      trackFormSubmit("/survey", { questionsAnswered: String(survey.length) });
      router.push("/processing");
    }
  };

  const isLast = currentQ === survey.length - 1;

  if (survey.length === 0) return null;

  return (
    <main className="min-h-screen flex flex-col items-center p-6 pt-12">
      {/* Language switcher */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      {/* Step indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex gap-2 mb-8"
        role="navigation"
        aria-label={t("progress", { current: currentQ + 1, total: survey.length })}
      >
        {survey.map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full transition-colors ${
              i === currentQ
                ? "bg-[#6EC6FF]"
                : i < currentQ
                  ? "bg-[#98E4C1]"
                  : "bg-gray-200"
            }`}
            aria-hidden="true"
          />
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={question.id}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-lg"
        >
          <Card>
            <div className="text-center mb-1">
              <span className="text-xs text-gray-400 font-medium">
                {t("questionNumber", { current: currentQ + 1, total: survey.length })}
              </span>
            </div>

            <h2 className="text-lg font-bold text-gray-700 text-center mb-6">
              {question.question}
            </h2>

            <TagSelector
              options={question.options.map((o) => ({
                label: o.label,
                value: o.tag,
              }))}
              selected={selectedTags}
              onToggle={handleToggle}
              maxSelections={question.maxSelections}
            />

            <p className="text-xs text-gray-400 text-center mt-3">
              {t("maxSelections", { max: question.maxSelections })}
            </p>

            <div className="text-center mt-6">
              <Button
                onClick={handleNext}
                disabled={selectedTags.length === 0}
                size="md"
              >
                {isLast ? t("start") : t("next")}
              </Button>
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

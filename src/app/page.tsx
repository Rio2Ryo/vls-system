"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { getEventByPassword, addAnalyticsRecord } from "@/lib/store";
import { trackPageView, trackPageLeave, trackFormSubmit } from "@/lib/tracker";

function TopPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Login");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Behavior tracking
  useEffect(() => {
    trackPageView("/");
    const enterTime = Date.now();
    return () => trackPageLeave("/", enterTime);
  }, []);

  // Auto-fill password from ?pw= query parameter
  useEffect(() => {
    const pw = searchParams.get("pw");
    if (pw) setPassword(pw);
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    trackFormSubmit("/");
    setError("");

    const trimmed = password.trim();
    if (!trimmed) {
      setError(t("errorEmpty"));
      return;
    }

    const event = getEventByPassword(trimmed);
    if (!event) {
      setError(t("errorWrong"));
      return;
    }

    // Check publish period
    if (event.status === "archived") {
      setError(t("errorArchived"));
      return;
    }
    if (event.expiresAt && event.expiresAt < Date.now() && event.status !== "active") {
      setError(t("errorExpired"));
      return;
    }

    sessionStorage.setItem("eventId", event.id);
    sessionStorage.setItem("eventName", event.name);
    if (event.companyIds && event.companyIds.length > 0) {
      sessionStorage.setItem("eventCompanyIds", JSON.stringify(event.companyIds));
    } else {
      sessionStorage.removeItem("eventCompanyIds");
    }

    // Create analytics record for this session
    const analyticsId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("analyticsId", analyticsId);
    addAnalyticsRecord({
      id: analyticsId,
      eventId: event.id,
      timestamp: Date.now(),
      stepsCompleted: {
        access: true,
        survey: false,
        cmViewed: false,
        photosViewed: false,
        downloaded: false,
      },
    });

    router.push("/survey");
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Language switcher */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      {/* Logo + Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="mb-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mirai.svg" alt={`${t("brandName")} ロゴ`} className="w-20 h-20 mx-auto" />
        </motion.div>
        <h1 className="text-3xl md:text-4xl font-black text-[#1a237e]">
          {t("brandName")}
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          {t("subtitle")}
        </p>
      </motion.div>

      {/* Password Form */}
      <Card className="w-full max-w-md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-bold text-gray-600 mb-2"
            >
              {t("passwordLabel")}
            </label>
            <input
              id="password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPlaceholder")}
              className="w-full px-4 py-3 rounded-xl border border-gray-200
                         focus:border-[#6EC6FF] focus:ring-2 focus:ring-blue-100
                         focus:outline-none text-center text-lg font-mono
                         tracking-wider bg-gray-50/50"
              data-testid="password-input"
            />
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-sm mt-2 text-center"
                data-testid="error-message"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </motion.p>
            )}
          </div>

          <div className="text-center">
            <Button type="submit" size="lg">
              {t("submit")}
            </Button>
          </div>
        </form>
      </Card>

      {/* Subtle hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="text-xs text-gray-300 mt-6"
      >
        {t("hint")}
      </motion.p>
    </main>
  );
}

export default function TopPage() {
  return (
    <Suspense>
      <TopPageInner />
    </Suspense>
  );
}

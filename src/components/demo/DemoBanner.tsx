"use client";

import { motion } from "framer-motion";

const STEP_LABELS = [
  "ステップ一覧",
  "名前入力",
  "アンケート",
  "CM視聴",
  "写真選択",
  "ダウンロード準備",
  "完了",
] as const;

interface DemoBannerProps {
  currentStep: number;
  onBackToTop: () => void;
}

export default function DemoBanner({ currentStep, onBackToTop }: DemoBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 shadow-lg"
    >
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-white/20 text-xs font-bold px-2 py-1 rounded-full">
            DEMO
          </span>
          <span className="text-sm font-medium">
            {currentStep > 0
              ? `Step ${currentStep}/6 — ${STEP_LABELS[currentStep]}`
              : STEP_LABELS[0]}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {currentStep > 0 && (
            <button
              onClick={onBackToTop}
              className="text-xs text-white/80 hover:text-white underline underline-offset-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
              aria-label="ステップ一覧に戻る"
            >
              一覧に戻る
            </button>
          )}
          <span className="text-xs text-white/60 hidden sm:inline">
            実際のサービスではパスワードでログインします
          </span>
        </div>
      </div>
    </motion.div>
  );
}

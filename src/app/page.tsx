"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import RainbowButton from "@/components/ui/RainbowButton";

export default function TopPage() {
  const router = useRouter();
  const [eventCode, setEventCode] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!eventCode.trim()) {
      setError("イベントコードを入力してください");
      return;
    }

    if (eventCode.trim().length < 4) {
      setError("イベントコードは4文字以上です");
      return;
    }

    sessionStorage.setItem("eventCode", eventCode.trim());
    router.push("/upload");
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <motion.h1
          className="text-5xl md:text-7xl font-extrabold mb-4"
          style={{
            background: "linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff, #9b59b6)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          VLS
        </motion.h1>
        <p className="text-xl text-gray-600 font-medium">
          Video Launch System
        </p>
        <p className="text-sm text-gray-400 mt-1">
          イベント写真マッチングシステム
        </p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white/80 backdrop-blur rounded-3xl shadow-xl p-8 space-y-6"
      >
        <div>
          <label
            htmlFor="eventCode"
            className="block text-lg font-bold text-gray-700 mb-2"
          >
            イベントコード
          </label>
          <input
            id="eventCode"
            type="text"
            value={eventCode}
            onChange={(e) => setEventCode(e.target.value)}
            placeholder="例: SUMMER2026"
            className="w-full px-4 py-3 rounded-xl border-2 border-purple-200 focus:border-purple-500 focus:outline-none text-lg text-center font-mono tracking-wider"
            data-testid="event-code-input"
          />
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-sm mt-2 text-center"
              data-testid="error-message"
            >
              {error}
            </motion.p>
          )}
        </div>

        <div className="text-center">
          <RainbowButton type="submit" size="lg">
            はじめる →
          </RainbowButton>
        </div>
      </motion.form>
    </main>
  );
}

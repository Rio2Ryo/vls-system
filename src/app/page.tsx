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
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <motion.div
          className="text-4xl mb-4"
          animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          ✨🧙‍♂️✨
        </motion.div>
        <motion.h1
          className="text-5xl md:text-7xl font-extrabold mb-4"
          style={{
            background: "linear-gradient(135deg, #FFD700, #FF69B4, #00CED1, #FFD700)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 20px rgba(255, 215, 0, 0.3))",
          }}
        >
          VLS
        </motion.h1>
        <p className="text-xl font-medium" style={{ color: "#FFD700" }}>
          Video Launch System
        </p>
        <p className="text-sm mt-1" style={{ color: "rgba(255, 215, 0, 0.5)" }}>
          イベント写真マッチングシステム
        </p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl shadow-xl p-8 space-y-6 glow-card"
        style={{
          background: "rgba(26, 0, 80, 0.6)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 215, 0, 0.2)",
        }}
      >
        <div>
          <label
            htmlFor="eventCode"
            className="block text-lg font-bold mb-2"
            style={{ color: "#FFD700" }}
          >
            イベントコード
          </label>
          <input
            id="eventCode"
            type="text"
            value={eventCode}
            onChange={(e) => setEventCode(e.target.value)}
            placeholder="例: SUMMER2026"
            className="w-full px-4 py-3 rounded-xl text-lg text-center font-mono tracking-wider focus:outline-none"
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "2px solid rgba(255, 215, 0, 0.3)",
              color: "#F0E6FF",
            }}
            data-testid="event-code-input"
          />
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm mt-2 text-center"
              style={{ color: "#FF69B4" }}
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

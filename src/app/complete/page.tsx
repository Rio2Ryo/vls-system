"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import RainbowButton from "@/components/ui/RainbowButton";
import Confetti from "@/components/ui/Confetti";

export default function CompletePage() {
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative z-10">
      {showConfetti && <Confetti />}

      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", duration: 0.8 }}
        className="text-center"
      >
        <motion.div
          className="text-8xl mb-6"
          animate={{ rotate: [0, 10, -10, 10, 0] }}
          transition={{ duration: 1, delay: 0.5 }}
          style={{ filter: "drop-shadow(0 0 20px rgba(255, 215, 0, 0.5))" }}
        >
          🎉
        </motion.div>

        <h1
          className="text-4xl md:text-6xl font-extrabold mb-4"
          style={{
            background: "linear-gradient(135deg, #FFD700, #FF69B4, #00CED1, #FFD700)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 20px rgba(255, 215, 0, 0.3))",
          }}
        >
          かんりょう！
        </h1>

        <p className="text-xl mb-2" style={{ color: "#FFD700" }}>
          写真のダウンロードができたよ！
        </p>
        <p className="mb-8" style={{ color: "rgba(255, 215, 0, 0.5)" }}>
          たのしいおもいでをありがとう！
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="space-y-4 text-center"
      >
        <RainbowButton
          onClick={() => {
            window.location.href = "/";
          }}
          size="lg"
        >
          もういちどつかう
        </RainbowButton>

        <div className="mt-4">
          <a
            href="https://example.com/lp"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline transition-colors hover:opacity-80"
            style={{ color: "#00CED1" }}
            data-testid="lp-link"
          >
            サービスについてもっとくわしく →
          </a>
        </div>
      </motion.div>
    </main>
  );
}

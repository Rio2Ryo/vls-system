"use client";

import { motion } from "framer-motion";

const SPARKLE_COLORS = ["#FFD700", "#FF69B4", "#00CED1", "#B088F9", "#FFD700"];

export default function LoadingAnimation() {
  return (
    <div className="flex flex-col items-center gap-6" data-testid="loading-animation">
      {/* Magical sparkles */}
      <div className="flex gap-3">
        {SPARKLE_COLORS.map((color, i) => (
          <motion.div
            key={i}
            className="text-3xl"
            style={{ color, textShadow: `0 0 10px ${color}` }}
            animate={{
              y: [0, -20, 0],
              scale: [1, 1.4, 1],
              rotate: [0, 180, 360],
              opacity: [0.7, 1, 0.7],
            }}
            transition={{
              duration: 1.2,
              delay: i * 0.15,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            ✦
          </motion.div>
        ))}
      </div>

      {/* Wizard character with wand animation */}
      <div className="relative">
        <motion.div
          className="text-6xl"
          animate={{
            y: [0, -8, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          🧙‍♂️
        </motion.div>

        {/* Magic wand trail */}
        <motion.div
          className="absolute -top-2 -right-4 text-2xl"
          animate={{
            scale: [0.5, 1.2, 0.5],
            opacity: [0.3, 1, 0.3],
            rotate: [0, 15, -15, 0],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ filter: "drop-shadow(0 0 8px #FFD700)" }}
        >
          ✨
        </motion.div>
      </div>

      {/* Magical text */}
      <motion.p
        className="text-lg font-bold"
        style={{
          background: "linear-gradient(90deg, #FFD700, #FF69B4, #00CED1)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        まほうをかけているよ...
      </motion.p>
    </div>
  );
}

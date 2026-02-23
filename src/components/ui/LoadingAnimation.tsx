"use client";

import { motion } from "framer-motion";

const STAR_COLORS = ["#ffd93d", "#ff6b6b", "#6bcb77", "#4d96ff", "#9b59b6"];

export default function LoadingAnimation() {
  return (
    <div className="flex flex-col items-center gap-6" data-testid="loading-animation">
      {/* Bouncing stars */}
      <div className="flex gap-3">
        {STAR_COLORS.map((color, i) => (
          <motion.div
            key={i}
            className="text-3xl"
            style={{ color }}
            animate={{
              y: [0, -20, 0],
              scale: [1, 1.3, 1],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: 1,
              delay: i * 0.15,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            ★
          </motion.div>
        ))}
      </div>
      {/* Running character */}
      <motion.div
        className="text-5xl"
        animate={{
          x: [-100, 100],
          scaleX: [1, 1, -1, -1],
        }}
        transition={{
          x: {
            duration: 2,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
          },
          scaleX: {
            duration: 2,
            repeat: Infinity,
            repeatType: "reverse",
            times: [0, 0.49, 0.5, 1],
          },
        }}
      >
        🏃
      </motion.div>
    </div>
  );
}

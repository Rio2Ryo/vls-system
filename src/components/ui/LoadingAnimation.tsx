"use client";

import { motion } from "framer-motion";

export default function LoadingAnimation() {
  return (
    <div className="flex flex-col items-center gap-4" data-testid="loading-animation" role="status" aria-label="読み込み中">
      <span className="sr-only">読み込み中</span>
      {/* Floating bubbles */}
      <div className="relative w-24 h-24">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 16 + i * 8,
              height: 16 + i * 8,
              background: ["#6EC6FF", "#FFB6C1", "#FFE4A0"][i],
              left: `${20 + i * 20}%`,
              top: "50%",
            }}
            animate={{
              y: [-10, -30, -10],
              opacity: [0.6, 1, 0.6],
              scale: [0.9, 1.1, 0.9],
            }}
            transition={{
              duration: 1.8,
              delay: i * 0.3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Camera icon wobble */}
      <motion.div
        className="text-5xl"
        animate={{ rotate: [-5, 5, -5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        📷
      </motion.div>
    </div>
  );
}

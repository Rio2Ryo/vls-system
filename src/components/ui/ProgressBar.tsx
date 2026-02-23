"use client";

import { motion } from "framer-motion";

interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
}

export default function ProgressBar({ progress, label }: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className="w-full" data-testid="progress-bar">
      {label && (
        <div className="flex justify-between mb-2 text-sm font-medium text-[#FFD700]">
          <span>{label}</span>
          <span>{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div className="w-full h-6 rounded-full overflow-hidden shadow-inner"
        style={{ backgroundColor: "rgba(255, 215, 0, 0.1)", border: "1px solid rgba(255, 215, 0, 0.3)" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background:
              "linear-gradient(90deg, #FFD700, #FF69B4, #00CED1, #FFD700)",
            backgroundSize: "200% 100%",
            boxShadow: "0 0 15px rgba(255, 215, 0, 0.5)",
          }}
          initial={{ width: 0 }}
          animate={{
            width: `${clampedProgress}%`,
            backgroundPosition: ["0% 0%", "100% 0%"],
          }}
          transition={{
            width: { duration: 0.5, ease: "easeOut" },
            backgroundPosition: { duration: 2, repeat: Infinity, ease: "linear" },
          }}
        />
      </div>
    </div>
  );
}

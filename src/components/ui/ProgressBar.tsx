"use client";

import { motion } from "framer-motion";

interface ProgressBarProps {
  progress: number;
  label?: string;
}

export default function ProgressBar({ progress, label }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className="w-full" data-testid="progress-bar">
      {label && (
        <div className="flex justify-between mb-2 text-sm font-medium text-gray-500">
          <span>{label}</span>
          <span>{Math.round(clamped)}%</span>
        </div>
      )}
      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(90deg, #6EC6FF, #A78BFA, #FFB6C1)",
            backgroundSize: "200% 100%",
          }}
          initial={{ width: 0 }}
          animate={{
            width: `${clamped}%`,
            backgroundPosition: ["0% 0%", "100% 0%"],
          }}
          transition={{
            width: { duration: 0.5, ease: "easeOut" },
            backgroundPosition: { duration: 3, repeat: Infinity, ease: "linear" },
          }}
        />
      </div>
    </div>
  );
}

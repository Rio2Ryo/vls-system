"use client";

import { motion } from "framer-motion";

interface TagSelectorProps {
  options: { label: string; value: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  maxSelections: number;
}

const TAG_COLORS = [
  "bg-blue-50 border-blue-200 text-blue-600",
  "bg-pink-50 border-pink-200 text-pink-600",
  "bg-yellow-50 border-yellow-200 text-yellow-700",
  "bg-green-50 border-green-200 text-green-600",
  "bg-purple-50 border-purple-200 text-purple-600",
  "bg-orange-50 border-orange-200 text-orange-600",
  "bg-teal-50 border-teal-200 text-teal-600",
  "bg-rose-50 border-rose-200 text-rose-600",
];

const SELECTED_COLORS = [
  "bg-blue-500 border-blue-500 text-white",
  "bg-pink-500 border-pink-500 text-white",
  "bg-yellow-500 border-yellow-500 text-white",
  "bg-green-500 border-green-500 text-white",
  "bg-purple-500 border-purple-500 text-white",
  "bg-orange-500 border-orange-500 text-white",
  "bg-teal-500 border-teal-500 text-white",
  "bg-rose-500 border-rose-500 text-white",
];

export default function TagSelector({
  options,
  selected,
  onToggle,
  maxSelections,
}: TagSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="tag-selector" role="group" aria-label="タグ選択">
      {options.map((opt, i) => {
        const isSelected = selected.includes(opt.value);
        const isDisabled = !isSelected && selected.length >= maxSelections;
        const colorIdx = i % TAG_COLORS.length;

        return (
          <motion.button
            key={opt.value}
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-disabled={isDisabled}
            aria-label={`${opt.label}${isSelected ? "（選択中）" : ""}`}
            whileHover={{ scale: isDisabled ? 1 : 1.05 }}
            whileTap={{ scale: isDisabled ? 1 : 0.95 }}
            onClick={() => !isDisabled && onToggle(opt.value)}
            className={`
              px-4 py-2 rounded-full text-sm font-medium border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] focus-visible:ring-offset-2
              ${isSelected ? SELECTED_COLORS[colorIdx] : TAG_COLORS[colorIdx]}
              ${isDisabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
            `}
            data-testid={`tag-${opt.value}`}
          >
            {isSelected && "✓ "}{opt.label}
          </motion.button>
        );
      })}
    </div>
  );
}

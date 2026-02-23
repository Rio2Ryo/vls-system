"use client";

import { motion } from "framer-motion";
import { MatchResult as MatchResultType } from "@/lib/types";

interface MatchResultProps {
  results: MatchResultType[];
  onSelect: (ids: string[]) => void;
  selectedIds: string[];
}

const LEVEL_CONFIG = {
  certain: {
    label: "確実マッチ",
    badge: "bg-green-500",
    border: "border-green-400",
    bg: "bg-green-50",
  },
  high: {
    label: "高確率マッチ",
    badge: "bg-blue-500",
    border: "border-blue-400",
    bg: "bg-blue-50",
  },
  review: {
    label: "要確認",
    badge: "bg-yellow-500",
    border: "border-yellow-400",
    bg: "bg-yellow-50",
  },
  none: {
    label: "",
    badge: "",
    border: "",
    bg: "",
  },
};

export default function MatchResultComponent({
  results,
  onSelect,
  selectedIds,
}: MatchResultProps) {
  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelect(selectedIds.filter((s) => s !== id));
    } else {
      onSelect([...selectedIds, id]);
    }
  };

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500" data-testid="no-results">
        マッチする写真が見つかりませんでした
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4" data-testid="match-results">
      {results.map((result, i) => {
        const config = LEVEL_CONFIG[result.level];
        const isSelected = selectedIds.includes(result.id);

        return (
          <motion.div
            key={result.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => toggleSelect(result.id)}
            className={`
              relative cursor-pointer rounded-xl overflow-hidden border-3
              ${isSelected ? "border-purple-500 ring-4 ring-purple-200" : config.border}
              ${config.bg} shadow-md hover:shadow-xl transition-shadow
            `}
            data-testid={`match-card-${result.id}`}
          >
            {/* Thumbnail */}
            <div className="aspect-[4/3] bg-gray-200 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.thumbnailUrl}
                alt="マッチ写真"
                className="w-full h-full object-cover"
              />
              {/* Score badge */}
              <div
                className={`absolute top-2 right-2 ${config.badge} text-white text-xs font-bold px-2 py-1 rounded-full`}
              >
                {result.score}%
              </div>
              {/* Selection indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 left-2 bg-purple-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm"
                >
                  ✓
                </motion.div>
              )}
            </div>
            {/* Label */}
            <div className="p-2 text-center">
              <span className="text-xs font-bold text-gray-600">{config.label}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

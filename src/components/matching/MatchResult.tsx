"use client";

import { motion } from "framer-motion";
import { MatchResult as MatchResultType } from "@/lib/types";

interface MatchResultProps {
  results: MatchResultType[];
  onSelect: (ids: string[]) => void;
  selectedIds: string[];
}

const TAG_LABELS: Record<string, { label: string; emoji: string }> = {
  face_detected: { label: "顔検出", emoji: "😊" },
  no_face: { label: "顔なし", emoji: "🖼" },
  group: { label: "グループ", emoji: "👥" },
  individual: { label: "個人", emoji: "👤" },
  indoor: { label: "屋内", emoji: "🏠" },
  outdoor: { label: "屋外", emoji: "🌳" },
};

const LEVEL_CONFIG = {
  certain: {
    label: "確実マッチ",
    badge: "#00CED1",
    border: "rgba(0, 206, 209, 0.6)",
    bg: "rgba(0, 206, 209, 0.08)",
  },
  high: {
    label: "高確率マッチ",
    badge: "#FFD700",
    border: "rgba(255, 215, 0, 0.6)",
    bg: "rgba(255, 215, 0, 0.08)",
  },
  review: {
    label: "要確認",
    badge: "#FF69B4",
    border: "rgba(255, 105, 180, 0.6)",
    bg: "rgba(255, 105, 180, 0.08)",
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
      <div className="text-center py-8" style={{ color: "rgba(255, 215, 0, 0.5)" }} data-testid="no-results">
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
            className="relative cursor-pointer rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-shadow"
            style={{
              border: isSelected ? "3px solid #FFD700" : `2px solid ${config.border}`,
              backgroundColor: config.bg,
              boxShadow: isSelected
                ? "0 0 20px rgba(255, 215, 0, 0.4)"
                : "0 4px 15px rgba(0, 0, 0, 0.3)",
            }}
            data-testid={`match-card-${result.id}`}
          >
            {/* Thumbnail */}
            <div className="aspect-[4/3] bg-gray-900 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.thumbnailUrl}
                alt="マッチ写真"
                className="w-full h-full object-cover"
              />
              {/* Score badge */}
              <div
                className="absolute top-2 right-2 text-white text-xs font-bold px-2 py-1 rounded-full"
                style={{
                  backgroundColor: config.badge,
                  boxShadow: `0 0 8px ${config.badge}`,
                }}
              >
                {result.score}%
              </div>
              {/* Selection indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 left-2 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    backgroundColor: "#FFD700",
                    boxShadow: "0 0 10px rgba(255, 215, 0, 0.5)",
                  }}
                >
                  ✓
                </motion.div>
              )}
            </div>
            {/* Label + Tags */}
            <div className="p-2 text-center" style={{ backgroundColor: "rgba(26, 0, 80, 0.6)" }}>
              <span className="text-xs font-bold" style={{ color: config.badge }}>
                {config.label}
              </span>
              {result.tags && result.tags.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1 mt-1">
                  {result.tags.map((tag) => {
                    const tagInfo = TAG_LABELS[tag];
                    return tagInfo ? (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: "rgba(255, 215, 0, 0.1)",
                          color: "rgba(255, 215, 0, 0.7)",
                          border: "1px solid rgba(255, 215, 0, 0.2)",
                        }}
                        data-testid={`tag-${tag}`}
                      >
                        {tagInfo.emoji} {tagInfo.label}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import RainbowButton from "@/components/ui/RainbowButton";
import MatchResultComponent from "@/components/matching/MatchResult";
import { generateDummyResults, getResultsByLevel } from "@/lib/matching";

export default function MatchingPage() {
  const router = useRouter();
  const results = useMemo(() => generateDummyResults(), []);
  const grouped = useMemo(() => getResultsByLevel(results), [results]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    grouped.certain.map((r) => r.id)
  );

  const handleDownload = () => {
    sessionStorage.setItem("selectedPhotos", JSON.stringify(selectedIds));
    router.push("/downloading");
  };

  return (
    <main className="min-h-screen flex flex-col items-center p-6 pt-12 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <h1
          className="text-3xl font-extrabold mb-2"
          style={{
            background: "linear-gradient(135deg, #FFD700, #00CED1)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          みつかったよ！
        </h1>
        <p style={{ color: "rgba(255, 215, 0, 0.7)" }}>
          あなたの写真が <span className="font-bold" style={{ color: "#FF69B4" }}>{results.length}枚</span> みつかりました
        </p>
      </motion.div>

      <div className="w-full max-w-2xl space-y-8">
        {/* Certain matches */}
        {grouped.certain.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: "#00CED1" }}>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: "#00CED1", boxShadow: "0 0 8px #00CED1" }} />
              確実マッチ ({grouped.certain.length}枚)
            </h2>
            <MatchResultComponent
              results={grouped.certain}
              selectedIds={selectedIds}
              onSelect={setSelectedIds}
            />
          </motion.section>
        )}

        {/* High probability matches */}
        {grouped.high.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: "#FFD700" }}>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: "#FFD700", boxShadow: "0 0 8px #FFD700" }} />
              高確率マッチ ({grouped.high.length}枚)
            </h2>
            <MatchResultComponent
              results={grouped.high}
              selectedIds={selectedIds}
              onSelect={setSelectedIds}
            />
          </motion.section>
        )}

        {/* Review matches */}
        {grouped.review.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: "#FF69B4" }}>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: "#FF69B4", boxShadow: "0 0 8px #FF69B4" }} />
              要確認 ({grouped.review.length}枚)
            </h2>
            <MatchResultComponent
              results={grouped.review}
              selectedIds={selectedIds}
              onSelect={setSelectedIds}
            />
          </motion.section>
        )}
      </div>

      {/* Download button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-8 mb-8"
      >
        <RainbowButton
          onClick={handleDownload}
          disabled={selectedIds.length === 0}
          size="lg"
        >
          {selectedIds.length}枚をダウンロード →
        </RainbowButton>
      </motion.div>
    </main>
  );
}

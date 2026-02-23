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
    <main className="min-h-screen flex flex-col items-center p-6 pt-12">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <h1 className="text-3xl font-extrabold text-purple-600 mb-2">
          みつかったよ！
        </h1>
        <p className="text-gray-500">
          あなたの写真が <span className="font-bold text-purple-500">{results.length}枚</span> みつかりました
        </p>
      </motion.div>

      <div className="w-full max-w-2xl space-y-8">
        {/* Certain matches */}
        {grouped.certain.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-lg font-bold text-green-600 mb-3 flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full" />
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
            <h2 className="text-lg font-bold text-blue-600 mb-3 flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full" />
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
            <h2 className="text-lg font-bold text-yellow-600 mb-3 flex items-center gap-2">
              <span className="w-3 h-3 bg-yellow-500 rounded-full" />
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

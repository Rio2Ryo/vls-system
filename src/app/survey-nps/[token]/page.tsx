"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";

interface NpsRecord {
  id: string;
  eventId: string;
  eventName: string;
  participantName: string;
  participantEmail: string;
  score?: number;
  comment?: string;
  token: string;
  sentAt: number;
  respondedAt?: number;
  expiresAt: number;
}

export default function NpsSurveyPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<NpsRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Fetch NPS record by token
  useEffect(() => {
    fetch("/api/nps")
      .then(res => res.json())
      .then((data: NpsRecord[]) => {
        const found = data.find(r => r.token === token);
        if (!found) {
          setError("無効なリンクです");
        } else if (Date.now() > found.expiresAt) {
          setError("このリンクは有効期限切れです");
        } else if (found.respondedAt) {
          setSubmitted(true);
          setRecord(found);
        } else {
          setRecord(found);
        }
      })
      .catch(() => setError("データの読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (score === null) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/nps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, score, comment: comment || undefined }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || "送信に失敗しました");
      }
    } catch {
      setError("送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  // NPS score label
  const getScoreLabel = (s: number): string => {
    if (s >= 9) return "とても満足";
    if (s >= 7) return "満足";
    if (s >= 5) return "普通";
    if (s >= 3) return "やや不満";
    return "不満";
  };

  // NPS score color
  const getScoreColor = (s: number): string => {
    if (s >= 9) return "#22C55E"; // green
    if (s >= 7) return "#6EC6FF"; // blue
    if (s >= 5) return "#FBBF24"; // amber
    if (s >= 3) return "#F97316"; // orange
    return "#EF4444"; // red
  };

  // Loading state
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-sm text-gray-400">読み込み中...</p>
        </div>
      </main>
    );
  }

  // Error state
  if (error && !submitted) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">😔</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">エラー</h1>
          <p className="text-gray-500">{error}</p>
        </motion.div>
      </main>
    );
  }

  // Already submitted state
  if (submitted) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">ご回答ありがとうございました</h1>
          <p className="text-gray-500 text-sm">
            {record?.eventName}のフィードバックを受け付けました。<br />
            今後のイベント改善に活かさせていただきます。
          </p>
        </motion.div>
      </main>
    );
  }

  // Survey form
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-6 flex items-center justify-center">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="bg-white rounded-3xl shadow-lg p-6 sm:p-8 max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">📋</div>
          <h1 className="text-xl font-bold text-gray-800">{record?.eventName}</h1>
          <p className="text-sm text-gray-500 mt-1">{record?.participantName}様、ご参加ありがとうございました</p>
        </div>

        {/* Question */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-4 text-center">
            このイベントを友人や同僚にどの程度おすすめしますか？
          </p>

          {/* Score buttons 0-10 */}
          <div className="flex justify-center gap-1 sm:gap-1.5 mb-2">
            {Array.from({ length: 11 }, (_, i) => i).map((s) => (
              <button
                key={s}
                onClick={() => setScore(s)}
                aria-label={`スコア ${s}`}
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl text-xs sm:text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                  score === s
                    ? "text-white shadow-lg scale-110"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                style={score === s ? { backgroundColor: getScoreColor(s) } : undefined}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Labels */}
          <div className="flex justify-between px-1 mb-4">
            <span className="text-[10px] text-gray-400">全くおすすめしない</span>
            <span className="text-[10px] text-gray-400">非常におすすめ</span>
          </div>

          {/* Selected score feedback */}
          {score !== null && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
              <span className="inline-block px-3 py-1 rounded-full text-sm font-medium text-white" style={{ backgroundColor: getScoreColor(score) }}>
                {score}点 — {getScoreLabel(score)}
              </span>
            </motion.div>
          )}
        </div>

        {/* Comment */}
        <div className="mb-6">
          <label htmlFor="nps-comment" className="text-sm text-gray-600 mb-2 block">
            ご意見・ご感想（任意）
          </label>
          <textarea
            id="nps-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="改善点やご感想がありましたらお聞かせください..."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#6EC6FF] focus-visible:ring-2 focus-visible:ring-[#6EC6FF] text-sm resize-none"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={score === null || submitting}
          aria-label="アンケートを送信"
          className="w-full py-3 rounded-xl font-bold text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: score !== null ? `linear-gradient(135deg, ${getScoreColor(score)}, #a78bfa)` : "#d1d5db" }}
        >
          {submitting ? "送信中..." : "回答を送信"}
        </button>

        {/* Footer */}
        <p className="text-[10px] text-gray-400 text-center mt-4">
          回答期限: {record ? new Date(record.expiresAt).toLocaleDateString("ja-JP") : "—"}
        </p>
      </motion.div>
    </main>
  );
}

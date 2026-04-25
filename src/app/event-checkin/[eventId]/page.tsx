"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

type Phase = "input" | "checking" | "success" | "already" | "error";

export default function EventCheckinPage() {
  const params = useParams();
  const eventId = typeof params.eventId === "string" ? params.eventId : "";

  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [resultName, setResultName] = useState("");
  const [eventName, setEventName] = useState("");
  const [checkedInAt, setCheckedInAt] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !eventId) return;
    setPhase("checking");

    try {
      const res = await fetch("/api/event-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, name: name.trim() }),
        cache: "no-store",
      });

      if (!res.ok) {
        setPhase("error");
        return;
      }

      const data = await res.json();
      setResultName(data.participantName);
      setEventName(data.eventName || "");
      setCheckedInAt(data.checkedInAt);

      if (data.status === "already") {
        setPhase("already");
      } else {
        setPhase("success");
      }
    } catch {
      setPhase("error");
    }
  };

  const handleReset = () => {
    setPhase("input");
    setName("");
    setResultName("");
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <div className="flex-shrink-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-4 shadow-lg">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-lg font-bold tracking-wide">📋 イベントチェックイン</h1>
          {eventName && phase !== "input" && (
            <p className="text-sm text-emerald-100 mt-1">{eventName}</p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">

            {/* Input form */}
            {phase === "input" && (
              <motion.div key="input" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <div className="bg-white rounded-2xl shadow-xl p-6 border border-slate-200">
                  <div className="text-center mb-6">
                    <span className="text-5xl block mb-3">🎪</span>
                    <h2 className="text-xl font-bold text-slate-800">チェックイン</h2>
                    <p className="text-sm text-slate-500 mt-1">お名前を入力してください</p>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">お名前（フルネーム）</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="例：山田 太郎"
                        className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none text-lg bg-slate-50 transition-colors"
                        autoFocus
                        autoComplete="name"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!name.trim()}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-lg shadow-lg hover:shadow-xl hover:from-emerald-600 hover:to-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                    >
                      チェックイン →
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {/* Checking */}
            {phase === "checking" && (
              <motion.div key="checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-200">
                <div className="inline-flex items-center gap-2 mb-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-4 h-4 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <p className="text-slate-500 text-lg">確認中...</p>
              </motion.div>
            )}

            {/* Success */}
            {phase === "success" && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }} onClick={handleReset} className="cursor-pointer">
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center border-2 border-emerald-400">
                  <motion.span
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.2, stiffness: 200 }}
                    className="text-8xl block mb-4"
                  >
                    ✅
                  </motion.span>
                  <h2 className="text-3xl font-black text-emerald-700">チェックイン完了！</h2>
                  <p className="text-2xl font-bold text-slate-800 mt-3">{resultName} さん</p>
                  <p className="text-sm text-slate-500 mt-1">ようこそ！</p>
                  {eventName && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <p className="text-sm text-slate-600 font-medium">🎪 {eventName}</p>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-4">
                    {checkedInAt ? new Date(checkedInAt).toLocaleString("ja-JP") : ""}
                  </p>
                  <p className="mt-6 text-sm text-slate-400 animate-pulse">タップして戻る</p>
                </div>
              </motion.div>
            )}

            {/* Already checked in */}
            {phase === "already" && (
              <motion.div key="already" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }} onClick={handleReset} className="cursor-pointer">
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center border-2 border-amber-400">
                  <span className="text-8xl block mb-4">⚠️</span>
                  <h2 className="text-2xl font-bold text-amber-700">チェックイン済みです</h2>
                  <p className="text-xl font-bold text-slate-800 mt-3">{resultName} さん</p>
                  {checkedInAt && (
                    <p className="text-sm text-slate-500 mt-2">
                      チェックイン時刻: {new Date(checkedInAt).toLocaleString("ja-JP")}
                    </p>
                  )}
                  <p className="mt-6 text-sm text-slate-400 animate-pulse">タップして戻る</p>
                </div>
              </motion.div>
            )}



            {/* Error */}
            {phase === "error" && (
              <motion.div key="error" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }}>
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center border-2 border-red-300">
                  <span className="text-6xl block mb-4">⚠️</span>
                  <h2 className="text-xl font-bold text-red-700">エラーが発生しました</h2>
                  <p className="text-sm text-slate-500 mt-2">しばらく待ってから再度お試しください。</p>
                  <button
                    onClick={handleReset}
                    className="mt-6 px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
                  >
                    ← やり直す
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 text-center py-3 text-xs text-slate-400">
        Powered by VLS System
      </div>
    </div>
  );
}

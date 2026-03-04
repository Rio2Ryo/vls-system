"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const csrfToken = document.cookie
        .split("; ")
        .find((c) => c.startsWith("csrf_token="))
        ?.split("=")[1];

      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ action: "request", email }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "エラーが発生しました");
      } else {
        setSent(true);
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#6EC6FF] to-[#A78BFA] px-6 py-5 text-center">
            <h1 className="text-xl font-bold text-white">パスワードリセット</h1>
            <p className="text-white/80 text-sm mt-1">登録メールアドレスを入力</p>
          </div>

          <div className="p-6">
            {sent ? (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-green-50 flex items-center justify-center">
                  <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-700 font-medium">メールを送信しました</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    メールアドレスが登録されている場合、<br />
                    リセットリンクを送信しました。<br />
                    メールをご確認ください。
                  </p>
                </div>
                <Link
                  href="/login"
                  className="inline-block text-sm text-[#6EC6FF] hover:underline"
                >
                  ログインに戻る
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-xs text-gray-500 mb-1.5">
                    メールアドレス
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    required
                    aria-label="メールアドレス"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]/30 text-sm"
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-xs text-center" role="alert" aria-live="assertive">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#6EC6FF] to-[#A78BFA] text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? "送信中..." : "リセットリンクを送信"}
                </button>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    ログインに戻る
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          VLS System &copy; {new Date().getFullYear()}
        </p>
      </motion.div>
    </main>
  );
}

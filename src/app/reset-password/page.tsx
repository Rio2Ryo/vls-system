"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";

type Status = "loading" | "valid" | "invalid" | "success" | "error";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [status, setStatus] = useState<Status>("loading");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const getCsrfToken = useCallback(() => {
    return document.cookie
      .split("; ")
      .find((c) => c.startsWith("csrf_token="))
      ?.split("=")[1];
  }, []);

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    const verify = async () => {
      try {
        const csrfToken = getCsrfToken();
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
          },
          body: JSON.stringify({ action: "verify", token }),
        });
        const data = await res.json();
        if (data.valid) {
          setStatus("valid");
          setMaskedEmail(data.email || "");
        } else {
          setStatus("invalid");
        }
      } catch {
        setStatus("invalid");
      }
    };

    verify();
  }, [token, getCsrfToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("パスワードは6文字以上で設定してください");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    setSubmitting(true);
    try {
      const csrfToken = getCsrfToken();
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ action: "reset", token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "エラーが発生しました");
        setStatus("error");
      } else {
        setStatus("success");
      }
    } catch {
      setError("通信エラーが発生しました");
      setStatus("error");
    } finally {
      setSubmitting(false);
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
            <h1 className="text-xl font-bold text-white">
              {status === "success" ? "リセット完了" : "新しいパスワード"}
            </h1>
            {maskedEmail && status === "valid" && (
              <p className="text-white/80 text-sm mt-1">{maskedEmail}</p>
            )}
          </div>

          <div className="p-6">
            {/* Loading */}
            {status === "loading" && (
              <div className="text-center py-8">
                <div className="w-8 h-8 mx-auto border-2 border-[#6EC6FF] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500 mt-3">トークンを検証中...</p>
              </div>
            )}

            {/* Invalid token */}
            {status === "invalid" && (
              <div className="text-center space-y-4 py-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-red-50 flex items-center justify-center">
                  <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-700 font-medium">リンクが無効です</p>
                  <p className="text-xs text-gray-500 mt-1">
                    リセットリンクが期限切れか、既に使用されています。
                  </p>
                </div>
                <Link
                  href="/forgot-password"
                  className="inline-block text-sm text-[#6EC6FF] hover:underline"
                >
                  もう一度リセットリンクを送信
                </Link>
              </div>
            )}

            {/* Password form */}
            {(status === "valid" || status === "error") && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="new-password" className="block text-xs text-gray-500 mb-1.5">
                    新しいパスワード
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="6文字以上"
                    required
                    minLength={6}
                    aria-label="新しいパスワード"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]/30 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-xs text-gray-500 mb-1.5">
                    パスワード確認
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="もう一度入力"
                    required
                    minLength={6}
                    aria-label="パスワード確認"
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
                  disabled={submitting || !newPassword || !confirmPassword}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#6EC6FF] to-[#A78BFA] text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {submitting ? "更新中..." : "パスワードを更新"}
                </button>
              </form>
            )}

            {/* Success */}
            {status === "success" && (
              <div className="text-center space-y-4 py-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-green-50 flex items-center justify-center">
                  <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-700 font-medium">パスワードを更新しました</p>
                  <p className="text-xs text-gray-500 mt-1">
                    新しいパスワードでログインしてください。
                  </p>
                </div>
                <Link
                  href="/login"
                  className="inline-block px-6 py-2 rounded-xl bg-[#6EC6FF] text-white text-sm font-bold hover:bg-[#5ab5ee] transition-colors"
                >
                  ログインへ
                </Link>
              </div>
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

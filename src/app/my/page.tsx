"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { csrfHeaders } from "@/lib/csrf";

export default function MyPortalLandingPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"form" | "sending" | "sent" | "error">("form");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || status === "sending") return;

    setStatus("sending");
    try {
      const res = await fetch("/api/my", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus("sent");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        {/* Header */}
        <div className="text-center">
          <p className="text-4xl mb-3">📋</p>
          <h1 className="text-2xl font-bold text-gray-800">マイページ</h1>
          <p className="text-sm text-gray-500 mt-2">
            過去に参加したイベントの写真を確認・再ダウンロードできます
          </p>
        </div>

        {status === "form" && (
          <Card>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  メールアドレス
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] focus:border-transparent text-sm"
                  aria-label="メールアドレス入力"
                />
                <p className="text-xs text-gray-400 mt-1">
                  イベント参加時に登録したメールアドレスを入力してください
                </p>
              </div>
              <Button type="submit" size="lg" className="w-full">
                ログインリンクを送信
              </Button>
            </form>
          </Card>
        )}

        {status === "sending" && (
          <Card className="text-center">
            <div className="inline-flex items-center gap-1.5 mb-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <p className="text-sm text-gray-500">送信中...</p>
          </Card>
        )}

        {status === "sent" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="text-center">
              <p className="text-4xl mb-3">✉️</p>
              <h2 className="text-lg font-bold text-gray-800 mb-2">
                メールを送信しました
              </h2>
              <p className="text-sm text-gray-500">
                <strong>{email}</strong> にログインリンクをお送りしました。
              </p>
              <p className="text-sm text-gray-500 mt-1">
                メールに記載のリンクからマイページにアクセスしてください。
              </p>
              <p className="text-xs text-gray-400 mt-3">
                リンクの有効期限は7日間です
              </p>
              <div className="mt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEmail("");
                    setStatus("form");
                  }}
                >
                  別のメールアドレスで再送信
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {status === "error" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="text-center">
              <p className="text-4xl mb-3">⚠️</p>
              <h2 className="text-lg font-bold text-gray-800 mb-2">
                送信に失敗しました
              </h2>
              <p className="text-sm text-gray-500">
                しばらく時間をおいてもう一度お試しください。
              </p>
              <div className="mt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setStatus("form")}
                >
                  やり直す
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </main>
  );
}

"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/errorLog";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, "global-error-boundary");
  }, [error]);

  return (
    <html lang="ja">
      <body className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-sm text-center bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
          <div className="text-4xl mb-3">😵</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            エラーが発生しました
          </h1>
          <p className="text-sm text-gray-400 mb-6">
            ページの読み込み中に問題が発生しました。もう一度お試しください。
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="px-6 py-3 rounded-2xl font-bold bg-gradient-to-r from-[#6EC6FF] to-[#A78BFA] text-white"
            >
              再試行
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              className="px-6 py-3 rounded-2xl font-bold bg-white text-gray-700 border border-gray-200"
            >
              トップに戻る
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

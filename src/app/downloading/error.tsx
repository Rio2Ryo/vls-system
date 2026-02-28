"use client";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-sm text-center">
        <div className="text-4xl mb-3">😵</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          ダウンロード中にエラーが発生しました
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          ページの読み込み中に問題が発生しました。もう一度お試しください。
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} size="md">
            再試行
          </Button>
          <Button
            onClick={() => (window.location.href = "/")}
            size="md"
            variant="secondary"
          >
            トップに戻る
          </Button>
        </div>
      </Card>
    </main>
  );
}

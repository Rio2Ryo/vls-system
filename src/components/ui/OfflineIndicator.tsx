"use client";

import { useServiceWorker } from "@/components/providers/ServiceWorkerProvider";

export default function OfflineIndicator() {
  const { isOffline, pendingSyncs } = useServiceWorker();

  if (!isOffline && pendingSyncs === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md px-4 py-2.5 rounded-xl text-sm text-center shadow-lg transition-all ${
        isOffline
          ? "bg-amber-500 text-white"
          : "bg-blue-500 text-white"
      }`}
    >
      {isOffline ? (
        <div className="flex items-center justify-center gap-2">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" aria-hidden="true" />
          <span>オフラインモード — データはローカルに保存されます</span>
        </div>
      ) : pendingSyncs > 0 ? (
        <div className="flex items-center justify-center gap-2">
          <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" aria-hidden="true" />
          <span>{pendingSyncs}件をサーバーに同期中...</span>
        </div>
      ) : null}
    </div>
  );
}

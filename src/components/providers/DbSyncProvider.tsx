"use client";

import { useEffect, useState } from "react";
import { syncFromDb } from "@/lib/store";

export default function DbSyncProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);

  useEffect(() => {
    syncFromDb()
      .catch(() => setSyncFailed(true))
      .finally(() => setReady(true));
  }, []);

  // Auto-dismiss the offline banner after 3 seconds
  useEffect(() => {
    if (!syncFailed) return;
    const timer = setTimeout(() => setSyncFailed(false), 3000);
    return () => clearTimeout(timer);
  }, [syncFailed]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      {syncFailed && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-0 inset-x-0 z-50 bg-yellow-500 text-white text-center text-sm py-2 px-4 animate-pulse"
        >
          サーバー同期に失敗しました。ローカルデータで起動しています。
        </div>
      )}
      {children}
    </>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getAllSyncQueue, removeSyncQueueItem, getSyncQueueCount } from "@/lib/idb";
import { csrfHeaders } from "@/lib/csrf";

interface SWContextValue {
  isOnline: boolean;
  isOffline: boolean;
  pendingSyncs: number;
  swRegistered: boolean;
}

const SWContext = createContext<SWContextValue>({
  isOnline: true,
  isOffline: false,
  pendingSyncs: 0,
  swRegistered: false,
});

export const useServiceWorker = () => useContext(SWContext);

export default function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncs, setPendingSyncs] = useState(0);
  const [swRegistered, setSwRegistered] = useState(false);

  // Register Service Worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => setSwRegistered(true))
        .catch(() => {});
    }
  }, []);

  // Online/offline detection
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Replay queued D1 syncs when back online
  const replayQueue = useCallback(async () => {
    try {
      const items = await getAllSyncQueue();
      if (items.length === 0) return;
      setPendingSyncs(items.length);

      for (const item of items) {
        try {
          const res = await fetch("/api/db", {
            method: "PUT",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ key: item.key, value: item.value }),
          });
          if (res.ok && item.id != null) {
            await removeSyncQueueItem(item.id);
            setPendingSyncs((prev) => Math.max(0, prev - 1));
          }
        } catch {
          // Still offline or network error — stop trying
          break;
        }
      }
    } catch {
      // IndexedDB error — ignore
    }
  }, []);

  // Trigger replay when coming back online
  useEffect(() => {
    if (isOnline) replayQueue();
  }, [isOnline, replayQueue]);

  // Check pending count on mount
  useEffect(() => {
    getSyncQueueCount()
      .then((count) => setPendingSyncs(count))
      .catch(() => {});
  }, []);

  return (
    <SWContext.Provider value={{ isOnline, isOffline: !isOnline, pendingSyncs, swRegistered }}>
      {children}
    </SWContext.Provider>
  );
}

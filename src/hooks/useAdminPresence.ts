"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { AdminPresence, EditLock } from "@/lib/types";

const HEARTBEAT_INTERVAL = 5_000; // 5s
const AVATAR_COLORS = [
  "#6EC6FF", "#F06595", "#51CF66", "#FFD43B", "#845EF7",
  "#FF922B", "#20C997", "#339AF0", "#FF6B6B", "#495057",
];

function pickColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface UseAdminPresenceReturn {
  /** Other active admins on admin pages */
  peers: AdminPresence[];
  /** Active edit locks */
  locks: EditLock[];
  /** SSE connected */
  connected: boolean;
  /** Acquire lock on a record. Returns true on success, false if locked by another. */
  acquireLock: (recordType: string, recordId: string) => Promise<{ ok: boolean; lockedBy?: string }>;
  /** Release lock on a record. */
  releaseLock: (recordType: string, recordId: string) => Promise<void>;
  /** Check if a record is locked by another user. */
  isLockedByOther: (recordType: string, recordId: string) => EditLock | null;
}

export function useAdminPresence(userId: string, userName: string): UseAdminPresenceReturn {
  const pathname = usePathname();
  const [peers, setPeers] = useState<AdminPresence[]>([]);
  const [locks, setLocks] = useState<EditLock[]>([]);
  const [connected, setConnected] = useState(false);
  const color = useRef(pickColor(userId));
  const esRef = useRef<EventSource | null>(null);

  // Parse SSE data
  const applySnapshot = useCallback((data: { presence: AdminPresence[]; locks: EditLock[] }) => {
    // Filter out self from peers
    setPeers(data.presence.filter((p) => p.userId !== userId));
    setLocks(data.locks);
  }, [userId]);

  // SSE connection
  useEffect(() => {
    if (!userId) return;

    let es: EventSource;
    try {
      es = new EventSource("/api/presence");
    } catch {
      return;
    }
    esRef.current = es;

    es.addEventListener("init", (e: MessageEvent) => {
      setConnected(true);
      try { applySnapshot(JSON.parse(e.data)); } catch { /* */ }
    });

    es.addEventListener("update", (e: MessageEvent) => {
      try { applySnapshot(JSON.parse(e.data)); } catch { /* */ }
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [userId, applySnapshot]);

  // Heartbeat
  useEffect(() => {
    if (!userId) return;

    const beat = () => {
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "heartbeat",
          userId,
          userName,
          page: pathname,
          color: color.current,
        }),
      }).catch(() => {});
    };

    beat(); // immediate
    const timer = setInterval(beat, HEARTBEAT_INTERVAL);

    return () => {
      clearInterval(timer);
      // Send leave on unmount
      navigator.sendBeacon?.(
        "/api/presence",
        new Blob([JSON.stringify({ action: "leave", userId })], { type: "application/json" }),
      );
    };
  }, [userId, userName, pathname]);

  // Acquire lock
  const acquireLock = useCallback(async (recordType: string, recordId: string): Promise<{ ok: boolean; lockedBy?: string }> => {
    try {
      const res = await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lock", userId, userName, recordType, recordId }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocks(data.locks || []);
        return { ok: true };
      }
      if (res.status === 409) {
        const data = await res.json();
        return { ok: false, lockedBy: data.lockedBy };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }, [userId, userName]);

  // Release lock
  const releaseLock = useCallback(async (recordType: string, recordId: string): Promise<void> => {
    try {
      await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlock", userId, userName, recordType, recordId }),
      });
    } catch { /* ignore */ }
  }, [userId, userName]);

  // Check if locked by another
  const isLockedByOther = useCallback((recordType: string, recordId: string): EditLock | null => {
    const lock = locks.find((l) => l.recordType === recordType && l.recordId === recordId);
    if (lock && lock.lockedBy !== userId) return lock;
    return null;
  }, [locks, userId]);

  return { peers, locks, connected, acquireLock, releaseLock, isLockedByOther };
}

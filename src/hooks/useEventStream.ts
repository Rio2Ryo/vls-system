"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UseEventStreamOptions {
  /** D1 keys to subscribe to */
  keys: string[];
  /** Called when new data arrives (should re-read localStorage) */
  onData: () => void;
  /** Enable/disable the stream (default: true) */
  enabled?: boolean;
  /** Polling interval in ms for fallback mode (default: 5000) */
  fallbackInterval?: number;
}

interface UseEventStreamReturn {
  /** Whether SSE connection is active */
  connected: boolean;
  /** Current data delivery mode */
  mode: "sse" | "polling";
  /** Timestamp of last received data */
  lastEvent: Date | null;
}

export function useEventStream({
  keys,
  onData,
  enabled = true,
  fallbackInterval = 5000,
}: UseEventStreamOptions): UseEventStreamReturn {
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<"sse" | "polling">("sse");
  const [lastEvent, setLastEvent] = useState<Date | null>(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const esRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);

  // Write SSE data to localStorage (only changed keys)
  const applyData = useCallback((data: Record<string, string>) => {
    if (typeof window === "undefined") return;
    for (const [key, value] of Object.entries(data)) {
      if (value && localStorage.getItem(key) !== value) {
        localStorage.setItem(key, value);
      }
    }
    setLastEvent(new Date());
    onDataRef.current();
  }, []);

  // Stable keys string for useEffect dependency
  const keysStr = keys.join(",");

  // SSE connection
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
      return;
    }

    // Attempt SSE connection
    let es: EventSource;
    try {
      es = new EventSource(`/api/sse?keys=${encodeURIComponent(keysStr)}`);
    } catch {
      setMode("polling");
      return;
    }
    esRef.current = es;

    es.addEventListener("init", (e: MessageEvent) => {
      retryCountRef.current = 0;
      setConnected(true);
      setMode("sse");
      try {
        applyData(JSON.parse(e.data));
      } catch { /* ignore parse error */ }
    });

    es.addEventListener("update", (e: MessageEvent) => {
      retryCountRef.current = 0;
      try {
        applyData(JSON.parse(e.data));
      } catch { /* ignore parse error */ }
    });

    es.addEventListener("error", () => {
      // Server sent an error event — fall back to polling
      es.close();
      esRef.current = null;
      setConnected(false);
      setMode("polling");
    });

    es.onerror = () => {
      setConnected(false);
      retryCountRef.current++;
      // After 3 failed reconnects, fall back to polling
      if (retryCountRef.current > 3) {
        es.close();
        esRef.current = null;
        setMode("polling");
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [enabled, keysStr, applyData]);

  // Fallback polling mode
  useEffect(() => {
    if (mode !== "polling" || !enabled) return;

    // Immediate call on entering polling mode
    onDataRef.current();
    setLastEvent(new Date());

    const timer = setInterval(() => {
      onDataRef.current();
      setLastEvent(new Date());
    }, fallbackInterval);

    return () => clearInterval(timer);
  }, [mode, enabled, fallbackInterval]);

  return { connected, mode, lastEvent };
}

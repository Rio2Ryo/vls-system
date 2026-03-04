"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

interface UseChatOptions {
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: "admin" | "user";
  enabled?: boolean;
}

interface UseChatReturn {
  messages: ChatMessage[];
  send: (text: string, targetUserId?: string) => Promise<void>;
  connected: boolean;
  unreadCount: number;
  markRead: () => void;
}

export function useChat({
  roomId,
  senderId,
  senderName,
  senderRole,
  enabled = true,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const isVisibleRef = useRef(true);

  // Track visibility for unread counting
  useEffect(() => {
    const handleVisibility = () => {
      isVisibleRef.current = document.visibilityState === "visible";
      if (isVisibleRef.current) setUnreadCount(0);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // SSE connection
  useEffect(() => {
    if (!enabled || !roomId) return;

    let es: EventSource;
    try {
      es = new EventSource(`/api/chat?roomId=${encodeURIComponent(roomId)}`);
    } catch {
      return;
    }
    esRef.current = es;

    es.addEventListener("init", (e: MessageEvent) => {
      setConnected(true);
      try {
        const initial: ChatMessage[] = JSON.parse(e.data);
        setMessages(initial);
      } catch { /* */ }
    });

    es.addEventListener("message", (e: MessageEvent) => {
      try {
        const msg: ChatMessage = JSON.parse(e.data);
        setMessages((prev) => [...prev, msg]);
        // Count unread if not from self and tab not visible
        if (msg.senderId !== senderId && !isVisibleRef.current) {
          setUnreadCount((c) => c + 1);
        }
      } catch { /* */ }
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [roomId, senderId, enabled]);

  // Send message
  const send = useCallback(
    async (text: string, targetUserId?: string) => {
      if (!text.trim()) return;
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          senderId,
          senderName,
          senderRole,
          text,
          targetUserId,
        }),
      }).catch(() => {});
    },
    [roomId, senderId, senderName, senderRole],
  );

  const markRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return { messages, send, connected, unreadCount, markRead };
}

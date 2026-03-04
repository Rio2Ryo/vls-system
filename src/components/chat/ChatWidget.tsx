"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChat } from "@/hooks/useChat";
import type { ChatMessage } from "@/lib/types";

interface ChatWidgetProps {
  roomId: string;
  userId: string;
  userName: string;
}

function WidgetBubble({ msg, isOwn }: { msg: ChatMessage; isOwn: boolean }) {
  const time = new Date(msg.timestamp);
  const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1.5`}>
      <div className="max-w-[80%]">
        <div className={`text-[9px] mb-0.5 ${isOwn ? "text-right" : ""} text-gray-400`}>
          {msg.senderName}
          {msg.senderRole === "admin" && (
            <span className="ml-1 text-blue-500 text-[8px]">スタッフ</span>
          )}
        </div>
        <div
          className={`px-2.5 py-1.5 rounded-xl text-xs break-words ${
            isOwn
              ? "bg-[var(--primary)] text-white rounded-br-sm"
              : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-sm"
          }`}
        >
          {msg.text}
        </div>
        <div className={`text-[8px] mt-0.5 text-gray-300 ${isOwn ? "text-right" : ""}`}>{timeStr}</div>
      </div>
    </div>
  );
}

export default function ChatWidget({ roomId, userId, userName }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const { messages, send, connected, unreadCount, markRead } = useChat({
    roomId,
    senderId: userId,
    senderName: userName,
    senderRole: "user",
    enabled: true,
  });

  // Auto-scroll
  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
      markRead();
    }
  }, [messages, open, markRead]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    markRead();
  }, [markRead]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    await send(input);
    setInput("");
  }, [input, send]);

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={handleOpen}
            aria-label="チャットを開く"
            className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
            style={{ backgroundColor: "var(--primary)" }}
          >
            💬
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-5 right-5 z-50 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
            style={{ maxHeight: "min(500px, 70vh)" }}
          >
            {/* Header */}
            <div
              className="px-4 py-2.5 flex items-center justify-between text-white"
              style={{ backgroundColor: "var(--primary)" }}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">チャット</span>
                {connected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-300" title="接続中" />
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-white/80 hover:text-white text-lg leading-none focus:outline-none"
                aria-label="チャットを閉じる"
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-2" style={{ minHeight: 200 }}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-xs">
                  スタッフにメッセージを送れます
                </div>
              ) : (
                messages
                  .filter((m) => !m.targetUserId || m.targetUserId === userId || m.senderId === userId)
                  .map((msg) => (
                    <WidgetBubble key={msg.id} msg={msg} isOwn={msg.senderId === userId} />
                  ))
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2 flex gap-2">
              <input
                className="flex-1 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="メッセージを入力..."
                aria-label="チャットメッセージ入力"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="px-3 py-1.5 rounded-xl text-xs text-white font-medium disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                style={{ backgroundColor: "var(--primary)" }}
                aria-label="送信"
              >
                送信
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

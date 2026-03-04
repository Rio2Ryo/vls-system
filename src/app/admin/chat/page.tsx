"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import AdminHeader from "@/components/admin/AdminHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useChat } from "@/hooks/useChat";
import {
  getStoredEvents,
  getStoredTenants,
  getEventsForTenant,
} from "@/lib/store";
import { ChatMessage, CHAT_TEMPLATES, EventData, Tenant } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({ msg, isOwnMessage }: { msg: ChatMessage; isOwnMessage: boolean }) {
  const time = new Date(msg.timestamp);
  const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} mb-2`}
    >
      <div className={`max-w-[75%] ${isOwnMessage ? "order-2" : ""}`}>
        {/* Sender name */}
        <div
          className={`text-[10px] mb-0.5 ${
            isOwnMessage ? "text-right text-gray-400 dark:text-gray-500" : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {msg.senderName}
          {msg.senderRole === "admin" && (
            <span className="ml-1 px-1 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-[9px]">
              管理者
            </span>
          )}
          {msg.targetUserId && (
            <span className="ml-1 px-1 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-[9px]">
              DM
            </span>
          )}
        </div>
        {/* Bubble */}
        <div
          className={`px-3 py-2 rounded-2xl text-sm break-words ${
            isOwnMessage
              ? "bg-[var(--primary)] text-white rounded-br-md"
              : msg.senderRole === "admin"
              ? "bg-blue-50 dark:bg-blue-900/20 text-gray-800 dark:text-gray-100 rounded-bl-md"
              : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-md"
          }`}
        >
          {msg.text}
        </div>
        {/* Time */}
        <div className={`text-[9px] mt-0.5 text-gray-400 ${isOwnMessage ? "text-right" : ""}`}>
          {timeStr}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Room List Sidebar
// ---------------------------------------------------------------------------

function RoomList({
  rooms,
  activeRoom,
  onSelect,
  unreadMap,
}: {
  rooms: { id: string; name: string }[];
  activeRoom: string;
  onSelect: (id: string) => void;
  unreadMap: Record<string, number>;
}) {
  return (
    <div className="space-y-1">
      {rooms.map((room) => {
        const isActive = room.id === activeRoom;
        const unread = unreadMap[room.id] || 0;
        return (
          <button
            key={room.id}
            onClick={() => onSelect(room.id)}
            aria-pressed={isActive}
            aria-label={`チャットルーム: ${room.name}`}
            className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
              isActive
                ? "bg-[var(--primary)] text-white font-medium"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="truncate">{room.name}</span>
              {unread > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white rounded-full min-w-[18px] text-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Auth
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");

  // State
  const [activeRoom, setActiveRoom] = useState("global");
  const [inputText, setInputText] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [targetUser, setTargetUser] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tenant
  const tenantId = session?.user?.tenantId ||
    (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) || null;
  const adminId = session?.user?.email || session?.user?.name || "admin";
  const adminName = session?.user?.name || "Admin";

  // Chat hook
  const { messages, send, connected } = useChat({
    roomId: activeRoom,
    senderId: adminId,
    senderName: adminName,
    senderRole: "admin",
    enabled: authed,
  });

  // Build room list from events
  const rooms = useMemo(() => {
    const events: EventData[] = tenantId
      ? getEventsForTenant(tenantId)
      : getStoredEvents();
    const roomList = [{ id: "global", name: "全体チャット" }];
    events.forEach((e) => {
      roomList.push({ id: e.id, name: e.name });
    });
    return roomList;
  }, [tenantId]);

  // Auth check
  useEffect(() => {
    if (status === "loading") return;
    if (session?.user) {
      setAuthed(true);
    } else {
      const stored = sessionStorage.getItem("adminAuthenticated");
      if (stored === "true") setAuthed(true);
    }
  }, [session, status]);

  const handleLogin = useCallback(() => {
    const tenants = getStoredTenants();
    const match = tenants.some((t: Tenant) => t.adminPassword === pw);
    if (match || pw === "ADMIN2026") {
      setAuthed(true);
      sessionStorage.setItem("adminAuthenticated", "true");
    } else {
      setPwError("パスワードが正しくありません");
    }
  }, [pw]);

  const handleLogout = useCallback(() => {
    setAuthed(false);
    sessionStorage.removeItem("adminAuthenticated");
    if (session?.user) signOut({ callbackUrl: "/admin" });
    else router.push("/admin");
  }, [session, router]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message
  const handleSend = useCallback(async () => {
    if (!inputText.trim()) return;
    await send(inputText, targetUser || undefined);
    setInputText("");
    setTargetUser("");
    setShowTemplates(false);
  }, [inputText, targetUser, send]);

  // Insert template
  const handleTemplate = useCallback((text: string) => {
    setInputText(text);
    setShowTemplates(false);
  }, []);

  // Track unread for other rooms (simplified — increment when room isn't active)
  // In a full implementation, each room would have its own SSE connection
  // For now, we track based on the active room only

  // --- Login screen ---
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-sm w-full">
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">管理画面ログイン</h1>
          <input
            className={inputCls}
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setPwError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="管理パスワード"
            aria-label="管理パスワード"
          />
          {pwError && <p className="text-xs text-red-500 mt-1">{pwError}</p>}
          <Button size="sm" onClick={handleLogin} className="mt-3 w-full">ログイン</Button>
        </Card>
      </div>
    );
  }

  // --- Main Chat UI ---
  const currentRoom = rooms.find((r) => r.id === activeRoom);

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <AdminHeader title="チャット" badge={connected ? "LIVE" : "オフライン"} onLogout={handleLogout} />

      <div className="flex-1 flex max-w-6xl mx-auto w-full p-4 sm:p-6 gap-4" style={{ minHeight: "calc(100vh - 120px)" }}>
        {/* Sidebar — room list */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 220, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 overflow-hidden"
            >
              <Card className="h-full">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-sm text-gray-800 dark:text-gray-100">ルーム</h2>
                  <span
                    className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-gray-300"}`}
                    title={connected ? "接続中" : "切断"}
                  />
                </div>
                <RoomList
                  rooms={rooms}
                  activeRoom={activeRoom}
                  onSelect={(id) => { setActiveRoom(id); setUnreadMap((m) => ({ ...m, [id]: 0 })); }}
                  unreadMap={unreadMap}
                />
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col">
          <Card className="flex-1 flex flex-col !p-0 overflow-hidden">
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 sm:hidden focus:outline-none"
                aria-label="サイドバー切り替え"
              >
                ☰
              </button>
              <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100">
                {currentRoom?.name || activeRoom}
              </h3>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {messages.length}件のメッセージ
              </span>
              <div className="ml-auto flex items-center gap-2">
                {connected ? (
                  <span className="text-[9px] text-green-400 px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20">
                    LIVE
                  </span>
                ) : (
                  <span className="text-[9px] text-gray-400 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700">
                    OFFLINE
                  </span>
                )}
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1" style={{ maxHeight: "calc(100vh - 320px)" }}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
                  メッセージはまだありません
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} isOwnMessage={msg.senderId === adminId} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Template quick-insert */}
            <AnimatePresence>
              {showTemplates && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-gray-100 dark:border-gray-700 overflow-hidden"
                >
                  <div className="px-4 py-2 flex flex-wrap gap-1.5">
                    {CHAT_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl}
                        onClick={() => handleTemplate(tpl)}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                      >
                        {tpl}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input area */}
            <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3">
              {/* DM target */}
              {targetUser && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded">
                    DM → {targetUser}
                  </span>
                  <button
                    onClick={() => setTargetUser("")}
                    className="text-[10px] text-gray-400 hover:text-red-500"
                    aria-label="DM解除"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded px-1"
                  aria-label="定型文テンプレート"
                  title="定型文"
                >
                  📋
                </button>
                <input
                  className={inputCls + " flex-1"}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={targetUser ? `${targetUser}にDM送信...` : "メッセージを入力... (Enter で送信)"}
                  aria-label="メッセージ入力"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                  style={{ backgroundColor: "var(--primary)" }}
                  aria-label="送信"
                >
                  送信
                </button>
              </div>
              {/* Broadcast / DM toggle */}
              <div className="flex items-center gap-3 mt-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="text"
                    className="text-[11px] px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 w-36 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                    value={targetUser}
                    onChange={(e) => setTargetUser(e.target.value)}
                    placeholder="DM先ユーザーID (空=全体)"
                    aria-label="DM先ユーザーID"
                  />
                </label>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  空欄 = 全体送信
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

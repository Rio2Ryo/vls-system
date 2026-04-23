"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Card from "@/components/ui/Card";
import {
  getParticipantByCheckinToken,
  getStoredParticipants,
  setStoredParticipants,
  getStoredEvents,
} from "@/lib/store";
import { fireWebhook } from "@/lib/webhook";
import type { Participant, EventData } from "@/lib/types";

type Status = "loading" | "success" | "already" | "not-found" | "error";

export default function CheckinTokenPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";

  const [status, setStatus] = useState<Status>("loading");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("not-found");
      return;
    }

    // Try server-side first (API), then fallback to localStorage
    const doCheckin = async () => {
      try {
        // Try API (works when data is in D1)
        const res = await fetch(`/api/checkin/${token}`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setParticipant({
            id: data.participantId,
            name: data.participantName,
            eventId: data.eventId,
            checkedIn: true,
            checkedInAt: data.checkedInAt,
            registeredAt: 0,
          });
          setEvent(data.eventName ? { id: data.eventId, name: data.eventName, date: data.eventDate || "", description: "", password: "", photos: [] } : null);
          setStatus(data.alreadyCheckedIn ? "already" : "success");
          return;
        }
        if (res.status === 404) {
          setStatus("not-found");
          return;
        }
      } catch {
        // API unavailable — try localStorage fallback
      }

      // Fallback: localStorage-based checkin
      const p = getParticipantByCheckinToken(token);
      if (!p) {
        setStatus("not-found");
        return;
      }

      const events = getStoredEvents();
      const evt = events.find((e) => e.id === p.eventId) || null;
      setEvent(evt);

      if (p.checkedIn) {
        setParticipant(p);
        setStatus("already");
        return;
      }

      // Perform check-in
      const all = getStoredParticipants();
      const now = Date.now();
      const updated = all.map((pp) =>
        pp.id === p.id ? { ...pp, checkedIn: true, checkedInAt: now } : pp
      );
      setStoredParticipants(updated);
      setParticipant({ ...p, checkedIn: true, checkedInAt: now });
      setStatus("success");

      fireWebhook("checkin", {
        eventId: p.eventId,
        participantName: p.name,
        participantEmail: p.email || undefined,
      }, p.tenantId);
    };

    doCheckin();
  }, [token]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-gray-50 to-gray-100">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {status === "loading" && (
          <Card className="text-center">
            <div className="inline-flex items-center gap-1.5 mb-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full bg-green-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <p className="text-gray-500 text-sm">チェックイン処理中...</p>
          </Card>
        )}

        {status === "success" && (
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
          >
            <Card className="text-center border-2 border-green-400">
              <span className="text-7xl block mb-4">✅</span>
              <h1 className="text-2xl font-black text-green-700 mb-2">
                チェックイン完了！
              </h1>
              <p className="text-xl font-bold text-gray-800">
                {participant?.name} さん
              </p>
              <p className="text-sm text-gray-500 mt-1">ようこそ！</p>
              {event && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-600 font-medium">
                    🎪 {event.name}
                  </p>
                  {event.date && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {event.date}
                    </p>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-4">
                {new Date().toLocaleString("ja-JP")}
              </p>
            </Card>
          </motion.div>
        )}

        {status === "already" && (
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
          >
            <Card className="text-center border-2 border-yellow-300">
              <span className="text-7xl block mb-4">⚠️</span>
              <h1 className="text-xl font-bold text-yellow-700 mb-2">
                すでにチェックイン済みです
              </h1>
              <p className="text-lg font-bold text-gray-800">
                {participant?.name} さん
              </p>
              {participant?.checkedInAt && (
                <p className="text-sm text-gray-500 mt-2">
                  チェックイン時刻:{" "}
                  {new Date(participant.checkedInAt).toLocaleString("ja-JP")}
                </p>
              )}
              {event && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-600 font-medium">
                    🎪 {event.name}
                  </p>
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {status === "not-found" && (
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
          >
            <Card className="text-center border-2 border-red-300">
              <span className="text-7xl block mb-4">❌</span>
              <h1 className="text-xl font-bold text-red-700 mb-2">
                無効なQRコードです
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                このQRコードは登録されていません。
              </p>
              <p className="text-sm text-gray-500">
                受付スタッフにお声がけください。
              </p>
            </Card>
          </motion.div>
        )}

        {status === "error" && (
          <Card className="text-center border-2 border-red-300">
            <span className="text-5xl block mb-3">⚠️</span>
            <h1 className="text-lg font-bold text-red-700 mb-2">
              エラーが発生しました
            </h1>
            <p className="text-sm text-gray-500">
              しばらく時間をおいて再度お試しください。
            </p>
          </Card>
        )}
      </motion.div>
    </main>
  );
}

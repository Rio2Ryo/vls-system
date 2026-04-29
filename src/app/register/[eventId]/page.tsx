"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { RegistrationField } from "@/lib/types";

type Phase = "loading" | "input" | "submitting" | "success" | "closed" | "full" | "duplicate" | "error";

interface EventInfo {
  name: string;
  date: string;
  venue: string;
  maxParticipants: number | null;
  currentCount: number;
  formTitle: string;
  description: string;
  customFields: RegistrationField[];
}

export default function RegisterPage() {
  const params = useParams();
  const eventId = typeof params.eventId === "string" ? params.eventId : "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [resultName, setResultName] = useState("");

  // Load event info on mount
  useEffect(() => {
    if (!eventId) { setPhase("error"); return; }
    (async () => {
      try {
        const res = await fetch(`/api/db?key=vls_admin_events&_t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) { setPhase("error"); return; }
        const data = await res.json();
        if (!data.value) { setPhase("error"); return; }
        const events = JSON.parse(data.value);
        const event = events.find((e: { id: string }) => e.id === eventId);
        if (!event) { setPhase("error"); return; }

        const makeInfo = (extra?: Partial<EventInfo>): EventInfo => ({
          name: event.name, date: event.date || "", venue: event.venue || "",
          maxParticipants: null, currentCount: 0,
          formTitle: event.registrationFormTitle || "イベント申し込み",
          description: event.registrationDescription || "",
          customFields: event.registrationFields || [],
          ...extra,
        });

        if (!event.registrationOpen) { setEventInfo(makeInfo()); setPhase("closed"); return; }

        if (event.registrationDeadline) {
          const deadlineEnd = new Date(event.registrationDeadline + "T23:59:59+09:00").getTime();
          if (Date.now() > deadlineEnd) { setEventInfo(makeInfo()); setPhase("closed"); return; }
        }

        let currentCount = 0;
        try {
          const pRes = await fetch(`/api/db?key=vls_participants&_t=${Date.now()}`, { cache: "no-store" });
          if (pRes.ok) {
            const pData = await pRes.json();
            if (pData.value) {
              const allP = JSON.parse(pData.value);
              currentCount = allP.filter((p: { eventId: string }) => p.eventId === eventId).length;
            }
          }
        } catch { /* ignore */ }

        const maxP = event.maxParticipants || null;
        if (maxP && currentCount >= maxP) {
          setEventInfo(makeInfo({ maxParticipants: maxP, currentCount }));
          setPhase("full");
          return;
        }

        setEventInfo(makeInfo({ maxParticipants: maxP, currentCount }));
        setPhase("input");
      } catch {
        setPhase("error");
      }
    })();
  }, [eventId]);

  // Extract name/email/phone from field values based on field type
  const extractSystemFields = () => {
    if (!eventInfo) return { name: "", email: "", phone: "" };
    let name = "", email = "", phone = "";
    for (const field of eventInfo.customFields) {
      const val = fieldValues[field.id]?.trim() || "";
      if (field.type === "name") name = val;
      else if (field.type === "email") email = val;
      else if (field.type === "phone") phone = val;
    }
    return { name, email, phone };
  };

  // Build customFields (non-system fields only)
  const buildCustomFields = () => {
    if (!eventInfo) return {};
    const custom: Record<string, string> = {};
    for (const field of eventInfo.customFields) {
      if (field.type !== "name" && field.type !== "email" && field.type !== "phone") {
        const val = fieldValues[field.id];
        if (val !== undefined && val !== "") custom[field.id] = val;
      }
    }
    return custom;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { name, email } = extractSystemFields();

    // Validate required fields
    if (eventInfo?.customFields) {
      for (const field of eventInfo.customFields) {
        const val = fieldValues[field.id]?.trim() || "";
        if (field.required && !val) {
          setErrorMessage(`「${field.label}」は必須項目です`);
          return;
        }
        if (field.type === "email" && val && (!val.includes("@") || !val.includes("."))) {
          setErrorMessage("メールアドレスの形式が正しくありません");
          return;
        }
      }
    }

    if (!name) { setErrorMessage("お名前が入力されていません"); return; }
    if (!email) { setErrorMessage("メールアドレスが入力されていません"); return; }

    setPhase("submitting");
    setErrorMessage("");

    try {
      const { phone } = extractSystemFields();
      const customFields = buildCustomFields();

      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          name,
          email,
          phone,
          customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "registration_closed" || data.error === "registration_deadline_passed") { setPhase("closed"); return; }
        if (data.error === "registration_full") { setPhase("full"); return; }
        if (data.error === "duplicate_email") { setPhase("duplicate"); setResultName(data.participantName || name); return; }
        setErrorMessage(data.message || "エラーが発生しました");
        setPhase("input");
        return;
      }

      setResultName(data.participantName || name);
      if (eventInfo) setEventInfo({ ...eventInfo, currentCount: data.currentCount || eventInfo.currentCount + 1 });
      setPhase("success");
    } catch {
      setErrorMessage("通信エラーが発生しました");
      setPhase("input");
    }
  };

  const handleReset = () => {
    setPhase("input");
    setFieldValues({});
    setErrorMessage("");
    setResultName("");
  };

  const setFieldValue = (fieldId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr + "T00:00:00");
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    } catch { return dateStr; }
  };

  const isSubmitting = phase === "submitting";
  const formTitle = eventInfo?.formTitle || "イベント申し込み";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <div className="flex-shrink-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-5 shadow-lg">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-xl font-bold tracking-wide">{formTitle}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md md:max-w-2xl">
          <AnimatePresence mode="wait">

            {/* Loading */}
            {phase === "loading" && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-200">
                <div className="inline-flex items-center gap-2 mb-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-4 h-4 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <p className="text-slate-500 text-lg">読み込み中...</p>
              </motion.div>
            )}

            {/* Input form */}
            {(phase === "input" || phase === "submitting") && (
              <motion.div key="input" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <div className="bg-white rounded-2xl shadow-xl p-6 border border-slate-200">
                  {/* Date & participant count */}
                  {eventInfo && (eventInfo.date || (eventInfo.maxParticipants && eventInfo.maxParticipants > 0)) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-sm text-slate-600">
                      {eventInfo.date && <span>📅 {formatDate(eventInfo.date)}</span>}
                      {eventInfo.maxParticipants && eventInfo.maxParticipants > 0 && (
                        <span className="text-emerald-600 font-medium">
                          👥 {eventInfo.currentCount} / {eventInfo.maxParticipants} 名（残り{eventInfo.maxParticipants - eventInfo.currentCount}席）
                        </span>
                      )}
                    </div>
                  )}

                  {/* Event description */}
                  {eventInfo?.description && (
                    <div className="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-200">
                      <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{eventInfo.description}</div>
                    </div>
                  )}

                  {errorMessage && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2 rounded-xl mb-4">{errorMessage}</div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* All fields from custom fields */}
                    {eventInfo?.customFields?.map((field) => (
                      <FieldInput
                        key={field.id}
                        field={field}
                        value={fieldValues[field.id] || ""}
                        onChange={(v) => setFieldValue(field.id, v)}
                        disabled={isSubmitting}
                      />
                    ))}

                    {(!eventInfo?.customFields || eventInfo.customFields.length === 0) && (
                      <p className="text-sm text-slate-400 text-center py-4">入力項目が設定されていません</p>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting || !eventInfo?.customFields?.length}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-lg shadow-lg hover:shadow-xl hover:from-emerald-600 hover:to-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                    >
                      {isSubmitting ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          送信中...
                        </span>
                      ) : "申し込む →"}
                    </button>
                  </form>

                  <p className="text-xs text-slate-400 text-center mt-4">申し込み完了後、確認メールをお送りします</p>
                </div>
              </motion.div>
            )}

            {/* Success */}
            {phase === "success" && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }}>
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center border-2 border-emerald-400">
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.2, stiffness: 200 }}
                    className="text-8xl block mb-4">🎉</motion.span>
                  <h2 className="text-2xl font-black text-emerald-700">申し込み完了！</h2>
                  <p className="text-xl font-bold text-slate-800 mt-3">{resultName} さん</p>
                  {eventInfo && (
                    <div className="mt-5 bg-slate-50 rounded-xl p-4 text-left">
                      <p className="text-sm font-bold text-slate-700 mb-2">🎪 {eventInfo.name}</p>
                      {eventInfo.date && <p className="text-sm text-slate-600">📅 {formatDate(eventInfo.date)}</p>}
                      {eventInfo.venue && <p className="text-sm text-slate-600">📍 {eventInfo.venue}</p>}
                    </div>
                  )}
                  <div className="mt-5 bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                    <p className="text-sm text-emerald-700">📧 確認メールを送信しました</p>
                    <p className="text-xs text-emerald-600 mt-1">受信トレイをご確認ください</p>
                  </div>
                  <button onClick={handleReset}
                    className="mt-6 px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors">
                    別の方の申し込み
                  </button>
                </div>
              </motion.div>
            )}

            {/* Closed */}
            {phase === "closed" && (
              <motion.div key="closed" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }}>
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center border-2 border-amber-300">
                  <span className="text-7xl block mb-4">🚫</span>
                  <h2 className="text-2xl font-bold text-amber-700">受付終了</h2>
                  <p className="text-slate-600 mt-3">このイベントの申し込み受付は終了しました</p>
                  {eventInfo && <p className="text-sm text-slate-500 mt-2">{eventInfo.name}</p>}
                </div>
              </motion.div>
            )}

            {/* Full */}
            {phase === "full" && (
              <motion.div key="full" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }}>
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center border-2 border-orange-300">
                  <span className="text-7xl block mb-4">🈵</span>
                  <h2 className="text-2xl font-bold text-orange-700">定員に達しました</h2>
                  <p className="text-slate-600 mt-3">大変申し訳ございませんが、定員に達したため受付を終了しました</p>
                  {eventInfo && (
                    <div className="mt-4">
                      <p className="text-sm text-slate-500">{eventInfo.name}</p>
                      {eventInfo.maxParticipants && <p className="text-xs text-slate-400 mt-1">定員: {eventInfo.maxParticipants}名</p>}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Duplicate */}
            {phase === "duplicate" && (
              <motion.div key="duplicate" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }}>
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center border-2 border-blue-300">
                  <span className="text-7xl block mb-4">📋</span>
                  <h2 className="text-xl font-bold text-blue-700">既に申し込み済みです</h2>
                  <p className="text-slate-600 mt-3">このメールアドレスは既に登録されています</p>
                  <p className="text-lg font-bold text-slate-800 mt-2">{resultName} さん</p>
                  <button onClick={handleReset}
                    className="mt-6 px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors">← 戻る</button>
                </div>
              </motion.div>
            )}

            {/* Error */}
            {phase === "error" && (
              <motion.div key="error" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }}>
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center border-2 border-red-300">
                  <span className="text-6xl block mb-4">⚠️</span>
                  <h2 className="text-xl font-bold text-red-700">エラーが発生しました</h2>
                  <p className="text-sm text-slate-500 mt-2">イベントが見つからないか、ページの読み込みに失敗しました</p>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      <div className="flex-shrink-0 text-center py-3 text-xs text-slate-400">Powered by VLS System</div>
    </div>
  );
}

/** Renders a single field based on its type */
function FieldInput({ field, value, onChange, disabled }: {
  field: RegistrationField; value: string; onChange: (v: string) => void; disabled: boolean;
}) {
  const inputBase = "w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none text-base bg-slate-50 transition-colors";

  // System fields (name/email/phone) render as styled inputs
  if (field.type === "name" || field.type === "email" || field.type === "phone") {
    const inputType = field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text";
    const autoComplete = field.type === "name" ? "name" : field.type === "email" ? "email" : "tel";
    const placeholder = field.type === "name" ? "例：山田 太郎" : field.type === "email" ? "example@email.com" : "090-1234-5678";
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {field.description && <p className="text-xs text-slate-500 mb-2">{field.description}</p>}
        <input type={inputType} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} className={inputBase}
          required={field.required} autoComplete={autoComplete} disabled={disabled} />
      </div>
    );
  }

  return (
    <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {field.description && <p className="text-xs text-slate-500 mb-2">{field.description}</p>}

      {field.type === "text" && (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className={inputBase} required={field.required} disabled={disabled} />
      )}

      {field.type === "textarea" && (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
          className={inputBase + " resize-none"} required={field.required} disabled={disabled} />
      )}

      {field.type === "radio" && field.options && (
        <div className="space-y-2 mt-1">
          {field.options.map((option, idx) => (
            <label key={idx} className="flex items-center gap-3 cursor-pointer group">
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                value === option ? "border-emerald-500 bg-emerald-500" : "border-slate-300 group-hover:border-emerald-400"}`}>
                {value === option && <span className="w-2.5 h-2.5 rounded-full bg-white" />}
              </span>
              <input type="radio" name={`field-${field.id}`} value={option} checked={value === option}
                onChange={() => onChange(option)} className="sr-only" disabled={disabled} />
              <span className="text-sm text-slate-700">{option}</span>
            </label>
          ))}
        </div>
      )}

      {field.type === "checkbox" && (
        <label className="flex items-start gap-3 cursor-pointer group mt-1">
          <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
            value === "true" ? "border-emerald-500 bg-emerald-500" : "border-slate-300 group-hover:border-emerald-400"}`}>
            {value === "true" && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>
          <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "")}
            className="sr-only" disabled={disabled} />
          <span className="text-sm text-slate-700">同意する</span>
        </label>
      )}
    </div>
  );
}

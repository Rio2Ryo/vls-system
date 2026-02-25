"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import { ADMIN_PASSWORD } from "@/lib/data";
import { Company, EventData } from "@/lib/types";
import {
  getStoredEvents, setStoredEvents,
  getStoredCompanies,
  getStoredAnalytics,
} from "@/lib/store";
import { AnalyticsRecord } from "@/lib/types";

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm";

const TIER_COLORS: Record<string, string> = {
  platinum: "bg-blue-100 text-blue-700",
  gold: "bg-yellow-100 text-yellow-700",
  silver: "bg-gray-100 text-gray-600",
  bronze: "bg-orange-100 text-orange-700",
};

export default function EventsPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");

  const [events, setEvents] = useState<EventData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", date: "", venue: "", description: "", password: "", companyIds: [] as string[] });
  const [toast, setToast] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrEventId, setQrEventId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [activeEventId, setActiveEventId] = useState<string>("");
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }, []);

  useEffect(() => {
    if (!authed) return;
    const evts = getStoredEvents();
    setEvents(evts);
    setCompanies(getStoredCompanies());
    setAnalytics(getStoredAnalytics());
    if (evts.length > 0 && !activeEventId) setActiveEventId(evts[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  useEffect(() => {
    if (sessionStorage.getItem("adminAuthed") === "true") setAuthed(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      setAuthed(true);
      sessionStorage.setItem("adminAuthed", "true");
    } else {
      setPwError("パスワードが違います");
    }
  };

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-800 text-center mb-4">イベント管理</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="管理パスワード"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-center"
              data-testid="events-password"
            />
            {pwError && <p className="text-red-400 text-sm text-center">{pwError}</p>}
            <Button type="submit" size="md" className="w-full">ログイン</Button>
          </form>
        </Card>
      </main>
    );
  }

  // --- Helpers ---
  const getShareUrl = (password: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/?pw=${encodeURIComponent(password)}`;
  };

  const copyUrl = (evt: EventData) => {
    navigator.clipboard.writeText(getShareUrl(evt.password));
    setCopiedId(evt.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleQr = async (evt: EventData) => {
    if (qrEventId === evt.id) { setQrEventId(null); setQrDataUrl(null); return; }
    setQrEventId(evt.id);
    try {
      const dataUrl = await QRCode.toDataURL(getShareUrl(evt.password), {
        width: 400, margin: 2, color: { dark: "#333333", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
    } catch { setQrDataUrl(null); }
  };

  const downloadQr = (evtName: string) => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `QR_${evtName.replace(/\s+/g, "_")}.png`;
    a.click();
  };

  // --- CRUD ---
  const startNew = () => {
    setEditing("__new__");
    setForm({ name: "", date: "", venue: "", description: "", password: "", companyIds: [] });
  };

  const startEdit = (evt: EventData) => {
    setEditing(evt.id);
    setForm({ name: evt.name, date: evt.date, venue: evt.venue || "", description: evt.description, password: evt.password, companyIds: evt.companyIds || [] });
  };

  const toggleCompany = (companyId: string) => {
    setForm((prev) => ({
      ...prev,
      companyIds: prev.companyIds.includes(companyId)
        ? prev.companyIds.filter((id) => id !== companyId)
        : [...prev.companyIds, companyId],
    }));
  };

  const save = () => {
    if (!form.name || !form.password) return;
    let updated: EventData[];
    if (editing === "__new__") {
      const newEvt: EventData = {
        id: `evt-${Date.now()}`,
        name: form.name,
        date: form.date,
        venue: form.venue || undefined,
        description: form.description,
        password: form.password.toUpperCase(),
        photos: [],
        companyIds: form.companyIds.length > 0 ? form.companyIds : undefined,
      };
      updated = [...events, newEvt];
    } else {
      updated = events.map((e) =>
        e.id === editing
          ? { ...e, name: form.name, date: form.date, venue: form.venue || undefined, description: form.description, password: form.password.toUpperCase(), companyIds: form.companyIds.length > 0 ? form.companyIds : undefined }
          : e
      );
    }
    setStoredEvents(updated);
    setEvents(updated);
    setEditing(null);
    showToast("イベントを保存しました");
  };

  const remove = (id: string) => {
    const updated = events.filter((e) => e.id !== id);
    setStoredEvents(updated);
    setEvents(updated);
    showToast("イベントを削除しました");
  };

  // --- Per-event stats ---
  const getEventStats = (eventId: string) => {
    const recs = analytics.filter((r) => r.eventId === eventId);
    const access = recs.filter((r) => r.stepsCompleted.access).length;
    const dl = recs.filter((r) => r.stepsCompleted.downloaded).length;
    return { access, dl, rate: access > 0 ? Math.round((dl / access) * 100) : 0 };
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <AdminHeader
        title="イベント管理"
        badge={`${events.length}件`}
        onLogout={() => { setAuthed(false); sessionStorage.removeItem("adminAuthed"); }}
      />

      {/* Active event context bar */}
      {events.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-blue-100 px-6 py-2">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <span className="text-xs text-gray-500 font-medium flex-shrink-0">操作対象:</span>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {events.map((evt) => (
                <button
                  key={evt.id}
                  onClick={() => setActiveEventId(evt.id)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                    activeEventId === evt.id
                      ? "bg-[#6EC6FF] text-white shadow-sm"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {evt.name}
                  <span className="ml-1 opacity-60">({evt.photos.length}枚)</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="px-4 py-2 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm text-center"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* New event button + form */}
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">イベント一覧</h2>
          <Button size="sm" onClick={startNew}>+ 新規イベント作成</Button>
        </div>

        <AnimatePresence>
          {editing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Card>
                <h3 className="font-bold text-gray-700 mb-3">
                  {editing === "__new__" ? "新規イベント作成" : "イベント編集"}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">イベント名 *</label>
                    <input className={inputCls} placeholder="例: 夏祭り 2026" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="event-name-input" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">開催日</label>
                    <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="event-date-input" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">会場</label>
                    <input className={inputCls} placeholder="例: 東京ビッグサイト" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} data-testid="event-venue-input" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">パスワード *</label>
                    <input className={inputCls + " font-mono uppercase"} placeholder="例: SUMMER2026" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="event-password-input" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-500 font-medium mb-1 block">説明</label>
                    <input className={inputCls} placeholder="イベントの説明" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                </div>

                {/* Company assignment */}
                {companies.length > 0 && (
                  <div className="border border-gray-100 rounded-xl p-3 mt-3">
                    <p className="text-xs font-bold text-gray-500 mb-2">CM企業の割り当て</p>
                    <p className="text-[10px] text-gray-400 mb-2">未選択の場合は全企業のCMが配信されます</p>
                    <div className="flex flex-wrap gap-2">
                      {companies.map((c) => (
                        <label key={c.id} className="flex items-center gap-1.5 cursor-pointer text-xs bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-full hover:bg-blue-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={form.companyIds.includes(c.id)}
                            onChange={() => toggleCompany(c.id)}
                            className="rounded border-gray-300 text-[#6EC6FF] focus:ring-[#6EC6FF] w-3.5 h-3.5"
                          />
                          <span className="text-gray-600">{c.name}</span>
                          <span className={`text-[10px] px-1 py-0.5 rounded font-bold uppercase ${TIER_COLORS[c.tier]}`}>{c.tier}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <Button size="sm" onClick={save}>保存</Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>キャンセル</Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Event list */}
        {events.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-400 text-center py-8">
              イベントが登録されていません。「新規イベント作成」からイベントを追加してください。
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {events.map((evt) => {
              const stats = getEventStats(evt.id);
              const isActive = activeEventId === evt.id;
              return (
                <Card key={evt.id} className={isActive ? "ring-2 ring-[#6EC6FF] ring-offset-1" : ""}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-700">{evt.name}</h3>
                        {isActive && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6EC6FF] text-white font-bold">操作中</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-400">
                        {evt.date && <span>{evt.date}</span>}
                        {evt.venue && <span>{evt.venue}</span>}
                        {evt.description && <span>{evt.description}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        パスワード: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono">{evt.password}</code>
                      </p>

                      {/* Stats badges */}
                      <div className="flex gap-2 mt-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                          {evt.photos.length}枚
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">
                          アクセス{stats.access}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium">
                          DL{stats.dl} ({stats.rate}%)
                        </span>
                      </div>

                      {/* Associated companies */}
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-gray-400">CM企業:</span>
                        {(!evt.companyIds || evt.companyIds.length === 0) ? (
                          <span className="text-[10px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full text-gray-500">全企業</span>
                        ) : (
                          evt.companyIds.map((cId) => {
                            const co = companies.find((c) => c.id === cId);
                            return co ? (
                              <span key={cId} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TIER_COLORS[co.tier]}`}>
                                {co.name}
                              </span>
                            ) : null;
                          })
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <button onClick={() => setActiveEventId(evt.id)} className="text-xs text-[#6EC6FF] hover:underline">選択</button>
                      <button onClick={() => startEdit(evt)} className="text-xs text-[#6EC6FF] hover:underline">編集</button>
                      <button onClick={() => remove(evt.id)} className="text-xs text-red-400 hover:underline">削除</button>
                    </div>
                  </div>

                  {/* Shareable URL */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400 mb-1">ユーザー向け共有URL</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg font-mono text-gray-600 truncate">
                        {getShareUrl(evt.password)}
                      </code>
                      <button
                        onClick={() => copyUrl(evt)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                          copiedId === evt.id
                            ? "bg-green-50 text-green-600 border border-green-200"
                            : "bg-[#6EC6FF] text-white hover:bg-blue-400"
                        }`}
                      >
                        {copiedId === evt.id ? "Copied!" : "URLコピー"}
                      </button>
                      <button
                        onClick={() => toggleQr(evt)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                          qrEventId === evt.id ? "bg-gray-200 text-gray-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {qrEventId === evt.id ? "QR閉じる" : "QRコード"}
                      </button>
                    </div>

                    {/* QR Code */}
                    <AnimatePresence>
                      {qrEventId === evt.id && qrDataUrl && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 flex flex-col items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl">
                            <canvas ref={qrCanvasRef} className="hidden" />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrDataUrl} alt={`QR Code for ${evt.name}`} className="w-48 h-48" />
                            <p className="text-[10px] text-gray-400 text-center">{getShareUrl(evt.password)}</p>
                            <button
                              onClick={() => downloadQr(evt.name)}
                              className="text-xs px-4 py-2 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors"
                            >
                              QRコードをダウンロード
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
